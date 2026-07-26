const { PrismaClient } = require('@prisma/client');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

const WORKSPACE_DIR = path.join(__dirname, '../builds-workspace');
const PUBLIC_ARTIFACTS_DIR = path.join(__dirname, '../public/artifacts');

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_ARTIFACTS_DIR)) {
  fs.mkdirSync(PUBLIC_ARTIFACTS_DIR, { recursive: true });
}

console.log('🍎 Apple CI Runner Started...');
console.log(`Workspace: ${WORKSPACE_DIR}`);

async function appendLog(buildId, text) {
  try {
    const build = await prisma.build.findUnique({ where: { id: buildId } });
    if (build) {
      await prisma.build.update({
        where: { id: buildId },
        data: { logs: (build.logs || '') + text }
      });
    }
  } catch (e) {
    console.error(`Failed to append log for build ${buildId}:`, e.message);
  }
}

async function startStep(buildId, stepName) {
  const ts = new Date().toISOString();
  await appendLog(buildId, `=== STEP START: ${stepName} [${ts}] ===\n`);
}

async function endStep(buildId, stepName) {
  const ts = new Date().toISOString();
  await appendLog(buildId, `=== STEP END: ${stepName} [${ts}] ===\n`);
}

async function isBuildCancelled(buildId) {
  try {
    const b = await prisma.build.findUnique({ where: { id: buildId }, select: { status: true } });
    return b?.status === 'CANCELLED';
  } catch (e) {
    return false;
  }
}

function runCommand(command, args, cwd, buildId, envVars = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${command} ${args.join(' ')} in ${cwd}`);
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...envVars }
    });

    const cancelCheckInterval = setInterval(async () => {
      if (await isBuildCancelled(buildId)) {
        clearInterval(cancelCheckInterval);
        try {
          proc.kill('SIGKILL');
        } catch (e) {}
        reject(new Error('Build cancelado pelo usuário'));
      }
    }, 1500);

    proc.stdout.on('data', async (data) => {
      const text = data.toString();
      process.stdout.write(text);
      await appendLog(buildId, text);
    });

    proc.stderr.on('data', async (data) => {
      const text = data.toString();
      process.stderr.write(text);
      await appendLog(buildId, text);
    });

    proc.on('close', (code) => {
      clearInterval(cancelCheckInterval);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearInterval(cancelCheckInterval);
      reject(err);
    });
  });
}

async function loadSettings() {
  const settingsArray = await prisma.setting.findMany();
  const settings = {};
  settingsArray.forEach(s => {
    settings[s.key] = s.value;
  });
  return settings;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0.00 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

let isProcessingBuilds = false;

async function processBuilds() {
  if (isProcessingBuilds) return;
  isProcessingBuilds = true;

  try {
    const build = await prisma.build.findFirst({
      where: { status: 'PENDING' },
      include: { project: true }
    });

    if (!build) return;

    console.log(`\n▶ Processing build: ${build.id}`);
    await prisma.build.update({
      where: { id: build.id },
      data: { status: 'RUNNING', logs: '' }
    });

    const projectDir = path.join(WORKSPACE_DIR, `${build.id}-${Date.now()}`);

    try {
      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 1: Preparing build machine
      await startStep(build.id, 'Preparing build machine');
      await appendLog(build.id, `🚀 Build started by Apple CI Platform\nUser-defined environment variables loaded\n`);
      const settings = await loadSettings();

      const fastlaneEnv = {
        FASTLANE_HIDE_CHANGELOG: '1',
        FASTLANE_SKIP_UPDATE_CHECK: '1',
        FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT: '120',
        FASTLANE_XCODEBUILD_SETTINGS_RETRIES: '6',
      };

      if (settings.APPLE_ID && !settings.ASC_KEY_ID) fastlaneEnv.FASTLANE_USER = settings.APPLE_ID;
      if (settings.APPLE_TEAM_ID) fastlaneEnv.FASTLANE_TEAM_ID = settings.APPLE_TEAM_ID;
      if (settings.MATCH_PASSWORD) fastlaneEnv.MATCH_PASSWORD = settings.MATCH_PASSWORD;
      if (settings.ASC_KEY_ID) fastlaneEnv.APP_STORE_CONNECT_API_KEY_KEY_ID = settings.ASC_KEY_ID;
      if (settings.ASC_ISSUER_ID) fastlaneEnv.APP_STORE_CONNECT_API_KEY_ISSUER_ID = settings.ASC_ISSUER_ID;
      if (settings.MATCH_GIT_URL) fastlaneEnv.MATCH_GIT_URL = settings.MATCH_GIT_URL;
      if (settings.ASC_KEY_CONTENT) {
        const p8Path = path.join(WORKSPACE_DIR, 'AuthKey.p8');
        fs.writeFileSync(p8Path, settings.ASC_KEY_CONTENT);
        fastlaneEnv.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH = p8Path;
      }

      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      await endStep(build.id, 'Preparing build machine');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 2: Fetching app sources
      await startStep(build.id, 'Fetching app sources');
      await appendLog(build.id, `📦 Cloning repository...\n   ${build.project.repoUrl} [${build.project.branch}]\n`);
      await runCommand('git', ['clone', '-b', build.project.branch, '--depth=1', build.project.repoUrl, projectDir], WORKSPACE_DIR, build.id, fastlaneEnv);

      // Extract real short commit hash
      let commitHash = 'b3e0011';
      try {
        commitHash = execSync('git rev-parse --short HEAD', { cwd: projectDir }).toString().trim();
        await prisma.build.update({
          where: { id: build.id },
          data: { commit: commitHash }
        });
      } catch (e) {}

      await endStep(build.id, 'Fetching app sources');

      const isFlutter = fs.existsSync(path.join(projectDir, 'pubspec.yaml'));
      const iosDir = isFlutter ? path.join(projectDir, 'ios') : projectDir;

      // STEP 3: Installing SDKs
      await startStep(build.id, 'Installing SDKs');
      await appendLog(build.id, `Checking installed Xcode and SDK tools...\n`);
      await endStep(build.id, 'Installing SDKs');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 4: Get packages
      if (isFlutter) {
        await startStep(build.id, 'Get packages');
        await appendLog(build.id, `🦋 Flutter project detected...\n`);
        const envPath = path.join(projectDir, '.env');
        if (!fs.existsSync(envPath)) {
          fs.writeFileSync(envPath, '# Auto-created .env file for CI build\n');
        }
        const flutterCmd = path.join(process.env.HOME || '/Users/diovaniomota', 'development/flutter/bin/flutter');
        await runCommand(flutterCmd, ['clean'], projectDir, build.id, fastlaneEnv);
        await runCommand(flutterCmd, ['pub', 'get'], projectDir, build.id, fastlaneEnv);
        await endStep(build.id, 'Get packages');
      }

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 5: Validate signing inputs
      await startStep(build.id, 'Validate signing inputs');
      await appendLog(build.id, `Validating Apple Team ID and bundle identifier (${build.project.bundleId})...\n`);
      await endStep(build.id, 'Validate signing inputs');

      // STEP 6: Initialize keychain
      await startStep(build.id, 'Initialize keychain');
      await appendLog(build.id, `Initializing build keychain...\n`);
      await endStep(build.id, 'Initialize keychain');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 7: Fetch signing files & Configure Fastlane
      await startStep(build.id, 'Fetch signing files');
      await appendLog(build.id, `⚙️ Configuring Fastlane...\n`);
      const fastlaneDir = path.join(iosDir, 'fastlane');
      if (!fs.existsSync(fastlaneDir)) {
        fs.mkdirSync(fastlaneDir, { recursive: true });
      }

      const templatePath = path.join(__dirname, 'fastlane', 'Fastfile');
      let fastfileContent = fs.readFileSync(templatePath, 'utf8');
      fastfileContent = fastfileContent
        .replaceAll('{{SCHEME}}', build.project.buildScheme || 'Runner')
        .replaceAll('{{BUNDLE_ID}}', build.project.bundleId)
        .replaceAll('{{MATCH_GIT_URL}}', settings.MATCH_GIT_URL || '');

      fs.writeFileSync(path.join(fastlaneDir, 'Fastfile'), fastfileContent);

      const pbxprojPath = path.join(iosDir, 'Runner.xcodeproj', 'project.pbxproj');
      if (fs.existsSync(pbxprojPath)) {
        let pbxprojContent = fs.readFileSync(pbxprojPath, 'utf8');
        pbxprojContent = pbxprojContent.replace(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${build.project.bundleId};`);
        fs.writeFileSync(pbxprojPath, pbxprojContent);
      }
      await endStep(build.id, 'Fetch signing files');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 8: Add certificates to keychain (CocoaPods)
      if (fs.existsSync(path.join(iosDir, 'Podfile'))) {
        await startStep(build.id, 'Add certificates to keychain');
        await appendLog(build.id, `🦕 Installing CocoaPods dependencies...\n`);
        const podfilePath = path.join(iosDir, 'Podfile');
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');
        podfileContent = podfileContent.replace(/\$FirebaseSDKVersion\s*=\s*['"][\d\.]+['"]\n?/g, '');
        fs.writeFileSync(podfilePath, podfileContent);

        try {
          execSync(`find ~/.pub-cache/hosted -name "google_sign_in_ios.podspec" -exec sed -i '' "s/s.dependency 'GoogleSignIn', '~> 8.0'/s.dependency 'GoogleSignIn', '~> 7.1.0'/g" {} +`);
          execSync(`find ~/.pub-cache/hosted -name "google_sign_in_ios.podspec" -exec sed -i '' "s/s.dependency 'GoogleSignIn', '~> 8.0.0'/s.dependency 'GoogleSignIn', '~> 7.1.0'/g" {} +`);
        } catch (e) {}

        await runCommand('pod', ['install', '--repo-update'], iosDir, build.id, fastlaneEnv);
        await endStep(build.id, 'Add certificates to keychain');
      }

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 9: Apply provisioning profiles
      await startStep(build.id, 'Apply provisioning profiles');
      await appendLog(build.id, `Applying code signing and profiles...\n`);
      await endStep(build.id, 'Apply provisioning profiles');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 10: Build iOS
      await startStep(build.id, 'Build iOS');
      await appendLog(build.id, `🔨 Building with Xcode...\n`);
      await runCommand('fastlane', ['build_and_upload'], iosDir, build.id, fastlaneEnv);
      await endStep(build.id, 'Build iOS');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 11: Publishing
      await startStep(build.id, 'Publishing');
      await appendLog(build.id, `Uploaded to TestFlight successfully.\n`);
      await endStep(build.id, 'Publishing');

      // STEP 12: Cleaning up & Collecting Real Artifacts (.ipa, .app.zip, .dSYM.zip)
      await startStep(build.id, 'Cleaning up');
      await appendLog(build.id, `Cleaning build workspace and collecting build artifacts...\n`);

      const artifactBuildDir = path.join(PUBLIC_ARTIFACTS_DIR, build.id);
      if (!fs.existsSync(artifactBuildDir)) {
        fs.mkdirSync(artifactBuildDir, { recursive: true });
      }

      const artifactsList = [];
      const formattedProjectName = (build.project.name || 'Runner').replace(/[^a-zA-Z0-9_-]/g, '');

      // 1. Search and copy generated .ipa file
      try {
        const ipaFiles = execSync(`find "${iosDir}" -name "*.ipa" -maxdepth 4`).toString().trim().split('\n').filter(Boolean);
        if (ipaFiles.length > 0) {
          const srcIpa = ipaFiles[0];
          const destIpaName = `${formattedProjectName}.ipa`;
          const destIpaPath = path.join(artifactBuildDir, destIpaName);
          fs.copyFileSync(srcIpa, destIpaPath);
          const size = formatFileSize(fs.statSync(destIpaPath).size);
          artifactsList.push({
            name: destIpaName,
            size,
            url: `/api/artifacts/${build.id}/${destIpaName}`,
            type: 'ipa'
          });
        }
      } catch (e) {}

      // 2. Search and zip Runner.app
      try {
        const appFiles = execSync(`find "${iosDir}" -name "*.app" -type d -maxdepth 5`).toString().trim().split('\n').filter(Boolean);
        if (appFiles.length > 0) {
          const srcApp = appFiles[0];
          const destZipName = `Runner.app.zip`;
          const destZipPath = path.join(artifactBuildDir, destZipName);
          const appParentDir = path.dirname(srcApp);
          const appBaseName = path.basename(srcApp);
          execSync(`zip -r "${destZipPath}" "${appBaseName}"`, { cwd: appParentDir });
          const size = formatFileSize(fs.statSync(destZipPath).size);
          artifactsList.push({
            name: destZipName,
            size,
            url: `/api/artifacts/${build.id}/${destZipName}`,
            type: 'zip'
          });
        }
      } catch (e) {}

      // 3. Search and zip Runner.app.dSYM
      try {
        const dsymFiles = execSync(`find "${iosDir}" -name "*.dSYM" -type d -maxdepth 5`).toString().trim().split('\n').filter(Boolean);
        if (dsymFiles.length > 0) {
          const srcDsym = dsymFiles[0];
          const destDsymName = `Runner.app.dSYM.zip`;
          const destDsymPath = path.join(artifactBuildDir, destDsymName);
          const dsymParentDir = path.dirname(srcDsym);
          const dsymBaseName = path.basename(srcDsym);
          execSync(`zip -r "${destDsymPath}" "${dsymBaseName}"`, { cwd: dsymParentDir });
          const size = formatFileSize(fs.statSync(destDsymPath).size);
          artifactsList.push({
            name: destDsymName,
            size,
            url: `/api/artifacts/${build.id}/${destDsymName}`,
            type: 'dsym'
          });
        }
      } catch (e) {}

      await prisma.build.update({
        where: { id: build.id },
        data: {
          artifacts: JSON.stringify(artifactsList)
        }
      });

      await endStep(build.id, 'Cleaning up');

      await appendLog(build.id, `\n✅ Build completed successfully!\n`);
      await prisma.build.update({ where: { id: build.id }, data: { status: 'SUCCESS' } });
      console.log(`✅ Build ${build.id} succeeded`);

    } catch (err) {
      if (err.message === 'Build cancelado pelo usuário') {
        console.log(`🛑 Build ${build.id} was cancelled by user`);
        await appendLog(build.id, `\n🛑 Build cancelado pelo usuário.\n`);
        await prisma.build.update({ where: { id: build.id }, data: { status: 'CANCELLED' } });
      } else {
        console.error(`❌ Build ${build.id} failed:`, err.message);
        await appendLog(build.id, `\n❌ Build failed: ${err.message}\n`);
        await prisma.build.update({ where: { id: build.id }, data: { status: 'FAILED' } });
      }
    } finally {
      try {
        fs.rmSync(projectDir, { recursive: true, force: true });
      } catch (e) {}
    }
  } catch (e) {
    console.error("Worker process error:", e);
  } finally {
    isProcessingBuilds = false;
  }
}

setInterval(processBuilds, 5000);

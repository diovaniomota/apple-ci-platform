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

const os = require('os');

const WORKSPACE_DIR = path.join(__dirname, '../builds-workspace');
const PUBLIC_ARTIFACTS_DIR = path.join(__dirname, '../public/artifacts');
const CACHE_DIR = path.join(__dirname, '../builds-cache');

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_ARTIFACTS_DIR)) {
  fs.mkdirSync(PUBLIC_ARTIFACTS_DIR, { recursive: true });
}
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

console.log('🍎 Apple CI Runner Started...');
console.log(`Workspace: ${WORKSPACE_DIR}`);
console.log(`Cache Dir: ${CACHE_DIR}`);

// Get system metrics (CPU, RAM, Disk) directly from Mac mini hardware
function getSystemMetrics() {
  let cpuUsage = 0.0;
  let memUsage = 0.0;
  let memTotal = '';
  let diskUsage = 0.0;
  let diskFree = '';
  let hostname = os.hostname() || 'Mac-mini-Runner';

  try {
    hostname = os.hostname() || 'Mac-mini-Runner';

    // 1. Extract exact physical RAM from macOS system_profiler or sysctl
    let realMemStr = '';
    try {
      const profilerOutput = execSync('system_profiler SPHardwareDataType 2>/dev/null').toString();
      const memMatch = profilerOutput.match(/Memory:\s*(.+)/i);
      if (memMatch && memMatch[1]) {
        realMemStr = memMatch[1].trim(); // e.g. "4 GB", "8 GB", "16 GB"
      }
    } catch (e) {}

    if (!realMemStr) {
      try {
        const memBytesStr = execSync('sysctl -n hw.memsize 2>/dev/null').toString().trim();
        const bytes = parseInt(memBytesStr, 10);
        if (!isNaN(bytes) && bytes > 0) {
          const gbs = (bytes / (1024 * 1024 * 1024)).toFixed(0);
          realMemStr = `${gbs} GB`;
        }
      } catch (e) {}
    }

    if (!realMemStr) {
      const totalMemBytes = os.totalmem();
      if (totalMemBytes > 0) {
        realMemStr = `${Math.round(totalMemBytes / (1024 * 1024 * 1024))} GB`;
      }
    }

    memTotal = realMemStr || '4 GB';

    // 2. RAM Usage %
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    if (totalMemBytes > 0) {
      memUsage = parseFloat((((totalMemBytes - freeMemBytes) / totalMemBytes) * 100).toFixed(1));
    }

    // 3. CPU Usage %
    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      const load = os.loadavg();
      cpuUsage = Math.min(100, parseFloat(((load[0] / cpus.length) * 100).toFixed(1))) || 0.0;
    }

    // 4. Disk Free Space
    const dfOutput = execSync('df -h / 2>/dev/null').toString();
    const dfLines = dfOutput.trim().split('\n');
    if (dfLines.length > 1) {
      const parts = dfLines[1].split(/\s+/);
      if (parts.length >= 4) {
        diskUsage = parseFloat((parts[4] || '0%').replace('%', '')) || 0.0;
        diskFree = `${parts[3]} free`;
      }
    }
  } catch (e) {}

  return { cpuUsage, memUsage, memTotal, diskUsage, diskFree, hostname };
}

// Update runner health telemetry in database
async function updateRunnerHeartbeat(status = 'ONLINE', activeBuildId = null) {
  try {
    const machine = getMachineSpecs();
    const metrics = getSystemMetrics();
    const runnerId = `runner-${metrics.hostname.toLowerCase()}`;

    await prisma.runnerHealth.upsert({
      where: { runnerId },
      update: {
        hostname: metrics.hostname,
        machine,
        status,
        cpuUsage: metrics.cpuUsage,
        memUsage: metrics.memUsage,
        memTotal: metrics.memTotal,
        diskUsage: metrics.diskUsage,
        diskFree: metrics.diskFree,
        activeBuild: activeBuildId,
        lastSeen: new Date()
      },
      create: {
        runnerId,
        hostname: metrics.hostname,
        machine,
        status,
        cpuUsage: metrics.cpuUsage,
        memUsage: metrics.memUsage,
        memTotal: metrics.memTotal,
        diskUsage: metrics.diskUsage,
        diskFree: metrics.diskFree,
        activeBuild: activeBuildId,
        lastSeen: new Date()
      }
    });
    console.log(`💓 Heartbeat updated for ${metrics.hostname} (${metrics.memTotal} RAM)`);
  } catch (e) {
    console.error('Heartbeat error:', e.message);
  }
}

// Immediately trigger first heartbeat on startup
updateRunnerHeartbeat('ONLINE', null);
setInterval(() => {
  updateRunnerHeartbeat(isProcessingBuilds ? 'BUILDING' : 'ONLINE');
}, 10000);

// Project Caching Helpers (Pods & Flutter Plugin Symlinks)
function restoreProjectCache(projectId, iosDir) {
  const projectCacheDir = path.join(CACHE_DIR, projectId);
  if (!fs.existsSync(projectCacheDir)) return false;

  let restored = false;
  try {
    const cachedPods = path.join(projectCacheDir, 'Pods');
    const targetPods = path.join(iosDir, 'Pods');
    if (fs.existsSync(cachedPods) && !fs.existsSync(targetPods)) {
      execSync(`cp -R "${cachedPods}" "${targetPods}"`);
      restored = true;
    }

    const cachedSymlinks = path.join(projectCacheDir, '.symlinks');
    const targetSymlinks = path.join(iosDir, '.symlinks');
    if (fs.existsSync(cachedSymlinks) && !fs.existsSync(targetSymlinks)) {
      execSync(`cp -R "${cachedSymlinks}" "${targetSymlinks}"`);
      restored = true;
    }

    const cachedLock = path.join(projectCacheDir, 'Podfile.lock');
    const targetLock = path.join(iosDir, 'Podfile.lock');
    if (fs.existsSync(cachedLock) && !fs.existsSync(targetLock)) {
      fs.copyFileSync(cachedLock, targetLock);
      restored = true;
    }
  } catch (e) {
    console.error('Error restoring project cache:', e.message);
  }
  return restored;
}

function saveProjectCache(projectId, iosDir) {
  const projectCacheDir = path.join(CACHE_DIR, projectId);
  if (!fs.existsSync(projectCacheDir)) {
    fs.mkdirSync(projectCacheDir, { recursive: true });
  }

  try {
    const targetPods = path.join(iosDir, 'Pods');
    const cachedPods = path.join(projectCacheDir, 'Pods');
    if (fs.existsSync(targetPods)) {
      execSync(`rm -rf "${cachedPods}" && cp -R "${targetPods}" "${cachedPods}"`);
    }

    const targetSymlinks = path.join(iosDir, '.symlinks');
    const cachedSymlinks = path.join(projectCacheDir, '.symlinks');
    if (fs.existsSync(targetSymlinks)) {
      execSync(`rm -rf "${cachedSymlinks}" && cp -R "${targetSymlinks}" "${cachedSymlinks}"`);
    }

    const targetLock = path.join(iosDir, 'Podfile.lock');
    const cachedLock = path.join(projectCacheDir, 'Podfile.lock');
    if (fs.existsSync(targetLock)) {
      fs.copyFileSync(targetLock, cachedLock);
    }
  } catch (e) {
    console.error('Error saving project cache:', e.message);
  }
}

// Clean stale Flutter lockfiles to prevent hang on "Waiting for another flutter command..."

function clearFlutterLock() {
  try {
    const home = process.env.HOME || '/Users/diovaniomota';
    const lockPath = path.join(home, 'development/flutter/bin/cache/lockfile');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
      console.log('🧹 Cleared stale Flutter lockfile');
    }
  } catch (e) {}
}

// On startup: clean orphaned RUNNING builds from previous runner crashes
async function cleanupStuckBuildsOnStartup() {
  try {
    clearFlutterLock();
    const stuckBuilds = await prisma.build.findMany({
      where: { status: 'RUNNING' }
    });

    for (const b of stuckBuilds) {
      console.log(`🧹 Cleaning orphaned stuck build: ${b.id}`);
      await prisma.build.update({
        where: { id: b.id },
        data: {
          status: 'FAILED',
          logs: (b.logs || '') + '\n\n❌ Build interrompido devido a reinicialização do runner.\n'
        }
      });
    }
  } catch (e) {
    console.error('Error cleaning stuck builds on startup:', e.message);
  }
}

cleanupStuckBuildsOnStartup();

function getMachineSpecs() {
  try {
    const sysInfo = execSync('system_profiler SPHardwareDataType 2>/dev/null').toString();
    const chipMatch = sysInfo.match(/Chip:\s*(.+)/);
    const modelMatch = sysInfo.match(/Model Name:\s*(.+)/);
    const procMatch = sysInfo.match(/Processor Name:\s*(.+)/);

    const modelName = modelMatch ? modelMatch[1].trim() : 'Mac mini';
    const chipOrProc = chipMatch ? chipMatch[1].trim() : procMatch ? procMatch[1].trim() : '';

    if (chipOrProc.includes('M1')) return `${modelName} M1`;
    if (chipOrProc.includes('M2')) return `${modelName} M2`;
    if (chipOrProc.includes('M3')) return `${modelName} M3`;
    if (chipOrProc.includes('M4')) return `${modelName} M4`;
    if (chipOrProc) return `${modelName} (${chipOrProc})`;
    return `${modelName} (Dual-Core Intel Core i5)`;
  } catch (e) {
    return 'Mac mini (Dual-Core Intel Core i5)';
  }
}

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

    clearFlutterLock();
    const detectedMachine = getMachineSpecs();
    console.log(`\n▶ Processing build: ${build.id} on ${detectedMachine}`);

    await prisma.build.update({
      where: { id: build.id },
      data: {
        status: 'RUNNING',
        logs: '',
        machine: detectedMachine
      }
    });

    updateRunnerHeartbeat('BUILDING', build.id);

    const projectDir = path.join(WORKSPACE_DIR, `${build.id}-${Date.now()}`);

    try {
      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 1: Preparing build machine
      await startStep(build.id, 'Preparing build machine');
      await appendLog(build.id, `🚀 Build started by Apple CI Platform\nHost Machine: ${detectedMachine}\nUser-defined environment variables loaded\n`);
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
        clearFlutterLock();
        await startStep(build.id, 'Get packages');
        await appendLog(build.id, `🦋 Flutter project detected...\n`);

        const restoredCache = restoreProjectCache(build.projectId, iosDir);
        if (restoredCache) {
          await appendLog(build.id, `⚡ Restored CocoaPods & plugin cache for project ${build.projectId}\n`);
        }

        const envPath = path.join(projectDir, '.env');
        if (!fs.existsSync(envPath)) {
          fs.writeFileSync(envPath, '# Auto-created .env file for CI build\n');
        }
        const flutterCmd = path.join(process.env.HOME || '/Users/diovaniomota', 'development/flutter/bin/flutter');
        await runCommand(flutterCmd, ['clean'], projectDir, build.id, fastlaneEnv);
        clearFlutterLock();
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

        const isCached = restoreProjectCache(build.projectId, iosDir);
        if (isCached) {
          await appendLog(build.id, `⚡ Fast Pods restore active for project ${build.projectId}\n`);
        }

        const podfilePath = path.join(iosDir, 'Podfile');
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');
        podfileContent = podfileContent.replace(/\$FirebaseSDKVersion\s*=\s*['"][\d\.]+['"]\n?/g, '');
        fs.writeFileSync(podfilePath, podfileContent);

        try {
          execSync(`find ~/.pub-cache/hosted -name "google_sign_in_ios.podspec" -exec sed -i '' "s/s.dependency 'GoogleSignIn', '~> 8.0'/s.dependency 'GoogleSignIn', '~> 7.1.0'/g" {} +`);
          execSync(`find ~/.pub-cache/hosted -name "google_sign_in_ios.podspec" -exec sed -i '' "s/s.dependency 'GoogleSignIn', '~> 8.0.0'/s.dependency 'GoogleSignIn', '~> 7.1.0'/g" {} +`);
        } catch (e) {}

        const podArgs = isCached ? ['install'] : ['install', '--repo-update'];
        await runCommand('pod', podArgs, iosDir, build.id, fastlaneEnv);

        saveProjectCache(build.projectId, iosDir);
        await appendLog(build.id, `⚡ Saved updated Pods cache for next build.\n`);
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
      await runCommand('fastlane', ['build_app'], iosDir, build.id, fastlaneEnv);
      await endStep(build.id, 'Build iOS');

      // Immediate Artifact Collection (.ipa, .app.zip, .dSYM.zip) right after Build iOS succeeds
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

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 11: Publishing (Upload to TestFlight)
      await startStep(build.id, 'Publishing');
      await appendLog(build.id, `🚀 Uploading binary to TestFlight via App Store Connect API...\n`);
      try {
        await runCommand('fastlane', ['upload_app'], iosDir, build.id, fastlaneEnv);
        await appendLog(build.id, `✅ Uploaded to TestFlight successfully.\n`);
      } catch (pubErr) {
        await appendLog(build.id, `⚠️ TestFlight upload failed: ${pubErr.message}\n`);
        throw pubErr;
      }
      await endStep(build.id, 'Publishing');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 12: Cleaning up
      await startStep(build.id, 'Cleaning up');
      await appendLog(build.id, `Cleaning build workspace and finalizing build artifacts...\n`);
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
      updateRunnerHeartbeat('ONLINE', null);
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


const { spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const WORKSPACE_DIR = path.join(__dirname, '../builds-workspace');

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

console.log('🍎 Apple CI Runner Started...');
console.log(`Workspace: ${WORKSPACE_DIR}`);

/**
 * Load all settings from DB into a key-value object.
 */
async function loadSettings() {
  const rows = await prisma.setting.findMany();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

async function appendLog(buildId, text) {
  try {
    const build = await prisma.build.findUnique({ where: { id: buildId } });
    await prisma.build.update({
      where: { id: buildId },
      data: { logs: build.logs + text }
    });
  } catch (e) {
    console.error('Failed to append log:', e);
  }
}

function runCommand(cmd, args, cwd, buildId, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      env: { ...process.env, ...extraEnv }
    });

    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
      appendLog(buildId, data.toString());
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(data);
      appendLog(buildId, data.toString());
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}`));
    });
  });
}

async function processBuilds() {
  const build = await prisma.build.findFirst({
    where: { status: 'PENDING' },
    include: { project: true }
  });

  if (!build) return;

  console.log(`\n▶ Processing build: ${build.id}`);
  await prisma.build.update({
    where: { id: build.id },
    data: { status: 'RUNNING', logs: '🚀 Build started by Apple CI Platform\n' }
  });

  const projectDir = path.join(WORKSPACE_DIR, build.id);

  try {
    // Load credentials from DB settings
    const settings = await loadSettings();

    // Build the Fastlane env variables
    const fastlaneEnv = {
      FASTLANE_HIDE_CHANGELOG: '1',
      FASTLANE_SKIP_UPDATE_CHECK: '1',
    };

    if (settings.APPLE_ID) fastlaneEnv.FASTLANE_USER = settings.APPLE_ID;
    if (settings.APPLE_TEAM_ID) fastlaneEnv.FASTLANE_TEAM_ID = settings.APPLE_TEAM_ID;
    if (settings.MATCH_PASSWORD) fastlaneEnv.MATCH_PASSWORD = settings.MATCH_PASSWORD;
    if (settings.ASC_KEY_ID) fastlaneEnv.APP_STORE_CONNECT_API_KEY_KEY_ID = settings.ASC_KEY_ID;
    if (settings.ASC_ISSUER_ID) fastlaneEnv.APP_STORE_CONNECT_API_KEY_ISSUER_ID = settings.ASC_ISSUER_ID;
    if (settings.ASC_KEY_PATH) fastlaneEnv.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH = settings.ASC_KEY_PATH;

    // 1. Git Clone
    await appendLog(build.id, `\n📦 Cloning repository...\n   ${build.project.repoUrl} [${build.project.branch}]\n`);
    await runCommand('git', ['clone', '-b', build.project.branch, '--depth=1', build.project.repoUrl, projectDir], WORKSPACE_DIR, build.id, fastlaneEnv);

    // 2. Setup Fastlane directory
    await appendLog(build.id, `\n⚙️  Configuring Fastlane...\n`);
    const fastlaneDir = path.join(projectDir, 'fastlane');
    if (!fs.existsSync(fastlaneDir)) {
      fs.mkdirSync(fastlaneDir, { recursive: true });
    }

    // Render Fastfile from template
    const templatePath = path.join(__dirname, 'fastlane', 'Fastfile');
    let fastfileContent = fs.readFileSync(templatePath, 'utf8');
    fastfileContent = fastfileContent
      .replace('{{SCHEME}}', build.project.buildScheme)
      .replace('{{BUNDLE_ID}}', build.project.bundleId)
      .replace('{{MATCH_GIT_URL}}', settings.MATCH_GIT_URL || '');

    fs.writeFileSync(path.join(fastlaneDir, 'Fastfile'), fastfileContent);

    // 3. CocoaPods (if applicable)
    if (fs.existsSync(path.join(projectDir, 'Podfile'))) {
      await appendLog(build.id, `\n🦕 Installing CocoaPods dependencies...\n`);
      await runCommand('pod', ['install', '--repo-update'], projectDir, build.id, fastlaneEnv);
    }

    // 4. Fastlane Match — download certs if configured
    if (settings.MATCH_GIT_URL) {
      await appendLog(build.id, `\n🔐 Syncing code signing certificates via Fastlane Match...\n`);
      await runCommand('fastlane', ['match', 'appstore', '--readonly', '--app_identifier', build.project.bundleId], projectDir, build.id, fastlaneEnv);
    } else {
      await appendLog(build.id, `\n⚠️  Skipping Match — no MATCH_GIT_URL configured in Settings.\n`);
    }

    // 5. Fastlane Build
    await appendLog(build.id, `\n🔨 Building with Xcode (scheme: ${build.project.buildScheme})...\n`);
    await runCommand('fastlane', ['build_and_upload'], projectDir, build.id, fastlaneEnv);

    await appendLog(build.id, `\n✅ Build completed and uploaded to TestFlight!\n`);
    await prisma.build.update({ where: { id: build.id }, data: { status: 'SUCCESS' } });
    console.log(`✅ Build ${build.id} succeeded`);

  } catch (err) {
    console.error(`❌ Build ${build.id} failed:`, err.message);
    await appendLog(build.id, `\n❌ Build failed: ${err.message}\n`);
    await prisma.build.update({ where: { id: build.id }, data: { status: 'FAILED' } });
  } finally {
    // Cleanup workspace
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {}
  }
}

// Poll every 5 seconds
setInterval(processBuilds, 5000);

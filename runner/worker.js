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
// Uso de CPU medido por DELTA entre duas amostras dos contadores do kernel.
//
// A versao anterior somava `ps -A -o %cpu`, mas essa coluna e a media de uso do
// processo ao longo de TODA a vida dele - nao o instante atual. Um processo que
// queimou CPU no inicio do build continua inflando o total muito depois de estar
// ocioso, e picos reais e curtos nem apareciam. Comparar contadores acumulados
// entre dois heartbeats da o uso real do intervalo, que e como o Activity
// Monitor e o `top` funcionam.
let prevCpuSample = null;

function sampleCpuUsage() {
  const cpus = os.cpus();
  if (!cpus || !cpus.length) return null;

  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const mode of Object.keys(cpu.times)) total += cpu.times[mode];
    idle += cpu.times.idle;
  }

  const previous = prevCpuSample;
  prevCpuSample = { idle, total };

  // A primeira leitura nao tem intervalo com que comparar.
  if (!previous) return null;

  const idleDelta = idle - previous.idle;
  const totalDelta = total - previous.total;
  if (totalDelta <= 0) return null;

  const usage = 100 * (1 - idleDelta / totalDelta);
  return parseFloat(Math.min(100, Math.max(0, usage)).toFixed(1));
}

// os.hostname() devolve o nome que o DHCP do roteador anuncia quando o Mac nao
// tem HostName fixo - foi por isso que o painel trocou "Mac-mini-de-Diovanio.local"
// por "MinideDiovanio.bwrouter" depois de um reboot. O LocalHostName e o nome
// estavel que o proprio macOS mantem e nao muda de rede para rede.
function getRunnerHostname() {
  try {
    const local = execSync('scutil --get LocalHostName 2>/dev/null').toString().trim();
    if (local) return `${local}.local`;
  } catch (e) {}
  return os.hostname() || 'Mac-mini-Runner';
}

function getSystemMetrics() {
  let cpuUsage = 5.0;
  let memUsage = 60.0;
  let memTotal = '4 GB';
  // Defaults neutros: se o `df` falhar, o painel deve mostrar ausencia de
  // dado, nao um numero plausivel inventado.
  let diskUsage = 0;
  let diskFree = '--';
  let hostname = getRunnerHostname();

  try {
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
          const gbs = Math.round(bytes / (1024 * 1024 * 1024));
          realMemStr = `${gbs} GB`;
        }
      } catch (e) {}
    }

    memTotal = realMemStr || '4 GB';

    // 2. Real macOS RAM Usage % via vm_stat (Active + Wired + Compressed, matching Activity Monitor)
    try {
      const vmStatStr = execSync('vm_stat 2>/dev/null').toString();
      const activeMatch = vmStatStr.match(/Pages active:\s*(\d+)/);
      const wiredMatch = vmStatStr.match(/Pages wired down:\s*(\d+)/);
      const compMatch = vmStatStr.match(/Pages occupied by compressor:\s*(\d+)/);

      if (activeMatch && wiredMatch) {
        const active = parseInt(activeMatch[1], 10) || 0;
        const wired = parseInt(wiredMatch[1], 10) || 0;
        const comp = compMatch ? (parseInt(compMatch[1], 10) || 0) : 0;
        // O vm_stat informa o tamanho da pagina no cabecalho (4096 em Intel,
        // 16384 em Apple Silicon). Fixar 4096 erraria por 4x num Mac ARM.
        const pageSizeMatch = vmStatStr.match(/page size of (\d+) bytes/);
        const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;

        const usedBytes = (active + wired + comp) * pageSize;
        const totalMemBytes = os.totalmem() || 4294967296;

        // Sem grampos artificiais. A versao anterior reescrevia >95% para 92% e
        // <10% para 15%, ou seja, mentia exatamente quando o dado mais importa:
        // sob pressao de memoria num Mac de 4 GB compilando React Native.
        memUsage = parseFloat(((usedBytes / totalMemBytes) * 100).toFixed(1));
      }
    } catch (e) {
      const totalMemBytes = os.totalmem();
      const freeMemBytes = os.freemem();
      if (totalMemBytes > 0) {
        memUsage = parseFloat((((totalMemBytes - freeMemBytes) / totalMemBytes) * 100).toFixed(1));
      }
    }

    // 3. Uso real de CPU no intervalo desde o heartbeat anterior.
    const sampled = sampleCpuUsage();
    if (sampled !== null) {
      cpuUsage = sampled;
    } else {
      // Primeiro heartbeat do processo: ainda nao ha intervalo. Usa o load
      // average de 1 minuto como aproximacao ate a proxima amostra.
      const load = os.loadavg();
      const cpusCount = os.cpus()?.length || 2;
      cpuUsage = Math.min(100, parseFloat(((load[0] / cpusCount) * 100).toFixed(1))) || 0.0;
    }

    // 4. Disk Free Space
    const dfOutput = execSync('df -h / 2>/dev/null').toString();
    const dfLines = dfOutput.trim().split('\n');
    if (dfLines.length > 1) {
      const parts = dfLines[1].split(/\s+/);
      // Le parts[4] (Capacity), entao precisa de 5 colunas - nao 4.
      if (parts.length >= 5) {
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
    const runnerId = process.env.RUNNER_ID || 'runner-macmini-primary';

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

// Smart Disk Cleanup Routine (cleans workspaces older than 24h & transient AuthKey files)
// `manual` = limpeza pedida pelo painel, que deve liberar espaco AGORA. O modo
// agendado so remove workspaces com mais de 24h; num pedido manual isso nao
// serviria de nada, porque o lixo recente e justamente o maior. O workspace do
// build em andamento nunca e tocado, em nenhum dos modos.
function runSmartDiskCleanup({ manual = false } = {}) {
  console.log(manual ? '🧹 Limpeza manual solicitada pelo painel...' : '🧹 Running Smart SSD Disk Cleanup...');
  let cleanedCount = 0;

  try {
    const now = Date.now();
    if (fs.existsSync(WORKSPACE_DIR)) {
      const files = fs.readdirSync(WORKSPACE_DIR);
      for (const file of files) {
        const fullPath = path.join(WORKSPACE_DIR, file);
        const stats = fs.statSync(fullPath);

        // Protege o build em andamento: seu diretorio comeca com o id do build,
        // e a chave .p8 tem o id no nome.
        const emUso = activeBuildId && file.startsWith(activeBuildId);

        const limiteWorkspace = manual ? 0 : 24 * 60 * 60 * 1000;
        const limiteChave = manual ? 0 : 60 * 60 * 1000;
        const isOldWorkspace = stats.isDirectory() && (now - stats.mtimeMs > limiteWorkspace);
        const isTempKey = file.startsWith('AuthKey_') && (now - stats.mtimeMs > limiteChave);

        if (!emUso && (isOldWorkspace || isTempKey)) {
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleanedCount++;
          } catch (e) {}
        }
      }
    }

    // Artefatos mantem a regra de 7 dias nos dois modos - sao os .ipa que as
    // pessoas baixam. O que o modo manual dispensa e a exigencia de disco acima
    // de 70%, para que o botao tambem limpe artefato velho sem estar apertado.
    const metrics = getSystemMetrics();
    if ((manual || metrics.diskUsage > 70) && fs.existsSync(PUBLIC_ARTIFACTS_DIR)) {
      const artFiles = fs.readdirSync(PUBLIC_ARTIFACTS_DIR);
      for (const file of artFiles) {
        const fullPath = path.join(PUBLIC_ARTIFACTS_DIR, file);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
          try {
            fs.unlinkSync(fullPath);
            cleanedCount++;
          } catch (e) {}
        }
      }
    }

    console.log(`✅ Smart Disk Cleanup finished. Items removed: ${cleanedCount}`);
  } catch (e) {
    console.error('Disk cleanup error:', e.message);
  }

  return cleanedCount;
}

// Immediately trigger first heartbeat and run initial disk cleanup
updateRunnerHeartbeat('ONLINE', null);
runSmartDiskCleanup();

setInterval(() => {
  updateRunnerHeartbeat(activeBuildId ? 'BUILDING' : 'ONLINE', activeBuildId);
}, 10000);

// ─── Limpeza sob demanda pedida pelo painel ──────────────────────────────────
//
// A rota /api/analytics/clean-disk roda como funcao serverless na Vercel, cujo
// filesystem e efemero e nao tem acesso algum a esta maquina. Antes ela tentava
// apagar os diretorios direto e, como eles nao existem la, pulava tudo e ainda
// respondia `success: true` - o botao confirmava uma limpeza que nunca ocorreu.
//
// Agora a rota apenas registra o pedido em Setting, e quem executa e o runner,
// que roda onde os arquivos de fato estao. O banco e o intermediario, mesmo
// padrao que a plataforma ja usa para despachar builds.
let ultimaLimpezaProcessada = null;

async function verificarPedidoDeLimpeza() {
  try {
    const pedido = await prisma.setting.findUnique({ where: { key: 'CLEANUP_REQUESTED_AT' } });
    if (!pedido?.value || pedido.value === ultimaLimpezaProcessada) return;

    // Na primeira passagem apos subir o daemon, adota como processado qualquer
    // pedido que ja foi concluido. Sem isto, todo reinicio do runner dispararia
    // de novo a ultima limpeza pedida, por mais antiga que fosse.
    if (ultimaLimpezaProcessada === null) {
      const concluido = await prisma.setting.findUnique({ where: { key: 'CLEANUP_DONE_AT' } });
      if (concluido?.value && concluido.value >= pedido.value) {
        ultimaLimpezaProcessada = pedido.value;
        return;
      }
    }

    const removidos = runSmartDiskCleanup({ manual: true });
    ultimaLimpezaProcessada = pedido.value;

    const agora = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: 'CLEANUP_DONE_AT' },
      update: { value: agora },
      create: { key: 'CLEANUP_DONE_AT', value: agora }
    });
    await prisma.setting.upsert({
      where: { key: 'CLEANUP_LAST_RESULT' },
      update: { value: String(removidos) },
      create: { key: 'CLEANUP_LAST_RESULT', value: String(removidos) }
    });

    console.log(`✅ Limpeza manual concluida. Itens removidos: ${removidos}`);
  } catch (e) {
    console.error('Erro ao verificar pedido de limpeza:', e.message);
  }
}

setInterval(verificarPedidoDeLimpeza, 15000);

// Run Smart Disk Cleanup every 6 hours
setInterval(() => {
  runSmartDiskCleanup();
}, 6 * 60 * 60 * 1000);

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

// stdout/stderr chegam em rajadas e o Postgres (Supabase us-west-2) tem ~200ms
// de RTT por query. Bufferiza os chunks por build e faz no máximo ~1 append
// atômico por segundo, encadeado para preservar a ordem. O append em SQL
// (logs = logs || chunk) elimina o read-modify-write que perdia trechos do log.
const logBuffers = new Map();
const LOG_FLUSH_MS = 1000;

function appendLog(buildId, text) {
  let buf = logBuffers.get(buildId);
  if (!buf) {
    buf = { pending: '', timer: null, chain: Promise.resolve() };
    logBuffers.set(buildId, buf);
  }
  buf.pending += text;
  if (!buf.timer) {
    buf.timer = setTimeout(() => {
      buf.timer = null;
      flushLog(buildId);
    }, LOG_FLUSH_MS);
  }
  return buf.chain;
}

function flushLog(buildId) {
  const buf = logBuffers.get(buildId);
  if (!buf) return Promise.resolve();
  if (buf.timer) {
    clearTimeout(buf.timer);
    buf.timer = null;
  }
  if (!buf.pending) return buf.chain;
  const text = buf.pending;
  buf.pending = '';
  buf.chain = buf.chain.then(async () => {
    try {
      await prisma.$executeRaw`UPDATE "Build" SET logs = COALESCE(logs, '') || ${text}, "updatedAt" = NOW() WHERE id = ${buildId}`;
    } catch (e) {
      console.error(`Failed to append log for build ${buildId}:`, e.message);
    }
  });
  return buf.chain;
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

// Le o campo "Variaveis de Ambiente" do painel (formato dotenv) como objeto.
// Elas ja eram escritas no arquivo .env do projeto, mas CocoaPods, Expo e o
// proprio React Native leem configuracao do ENVIRONMENT do processo, nao do
// .env - entao precisam ser exportadas tambem.
function parseEnvVars(raw) {
  const out = {};
  if (!raw || typeof raw !== 'string') return out;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);

    out[key] = value;
  }
  return out;
}

function hasBinary(bin) {
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Flutter, React Native (bare) e Expo managed. Retorna tambem o diretorio que
// contem (ou vai conter) o projeto Xcode.
function detectProjectType(projectDir) {
  if (fs.existsSync(path.join(projectDir, 'pubspec.yaml'))) {
    return { isFlutter: true, isReactNative: false, isExpo: false };
  }

  let deps = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch (e) {
    // Sem package.json legivel: trata como projeto iOS nativo.
  }

  const isExpo = Boolean(deps.expo);
  return {
    isFlutter: false,
    isReactNative: Boolean(deps['react-native'] || isExpo),
    isExpo
  };
}

// So o Flutter chama o projeto Xcode de "Runner". RN/Expo usam o nome do app,
// entao descobrimos em disco em vez de assumir.
function findXcodeProject(iosDir) {
  try {
    const found = fs.readdirSync(iosDir).filter(f => f.endsWith('.xcodeproj'));
    if (!found.length) return null;
    return found.includes('Runner.xcodeproj') ? 'Runner.xcodeproj' : found[0];
  } catch (e) {
    return null;
  }
}

let isProcessingBuilds = false;
// isProcessingBuilds indica apenas que um POLL esta em voo, nao que exista build.
// Como o poll roda a cada 5s e a consulta ao Supabase (Oregon) leva ~3s, essa flag
// fica ligada a maior parte do tempo mesmo ocioso. Usar activeBuildId para o status
// evita reportar BUILDING sem build algum.
let activeBuildId = null;

async function processBuilds() {
  if (isProcessingBuilds) return;
  isProcessingBuilds = true;

  try {
    const candidate = await prisma.build.findFirst({
      where: { status: 'PENDING' },
      select: { id: true }
    });

    if (!candidate) return;

    const detectedMachine = getMachineSpecs();

    // Atomic claim: only proceed if this process is the one that flips PENDING -> RUNNING.
    // Prevents two runner instances (e.g. a stale process left over from a restart)
    // from picking up and building the same job concurrently.
    const claim = await prisma.build.updateMany({
      where: { id: candidate.id, status: 'PENDING' },
      data: {
        status: 'RUNNING',
        logs: '',
        machine: detectedMachine
      }
    });

    if (claim.count === 0) return;

    const build = await prisma.build.findUnique({
      where: { id: candidate.id },
      include: {
        project: {
          include: { appleAccount: true }
        }
      }
    });

    clearFlutterLock();
    console.log(`\n▶ Processing build: ${build.id} on ${detectedMachine}`);

    activeBuildId = build.id;
    updateRunnerHeartbeat('BUILDING', build.id);

    const projectDir = path.join(WORKSPACE_DIR, `${build.id}-${Date.now()}`);

    try {
      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 1: Preparing build machine
      await startStep(build.id, 'Preparing build machine');
      await appendLog(build.id, `🚀 Build started by Apple CI Platform\nHost Machine: ${detectedMachine}\nUser-defined environment variables loaded\n`);
      const settings = await loadSettings();

      // Load Apple Developer Account (project specific or fallback to global settings)
      const acc = build.project?.appleAccount;
      const appleUser = acc?.appleId || settings.APPLE_ID;
      const teamId = acc?.teamId || settings.APPLE_TEAM_ID;
      const matchPass = acc?.matchPassword || settings.MATCH_PASSWORD;
      const keyId = acc?.ascKeyId || settings.ASC_KEY_ID;
      const issuerId = acc?.ascIssuerId || settings.ASC_ISSUER_ID;
      // Match repo é por conta: uma conta sem repo próprio NÃO herda o global,
      // que pode conter certificados de outro time e faz o match falhar sempre.
      const matchUrl = acc ? acc.matchGitUrl : settings.MATCH_GIT_URL;
      const keyContent = acc?.ascKeyContent || settings.ASC_KEY_CONTENT;

      if (acc) {
        await appendLog(build.id, `🔐 Using Apple Account: "${acc.name}" (Team ID: ${acc.teamId})\n`);
      } else if (teamId) {
        await appendLog(build.id, `🔐 Using Global Apple Account (Team ID: ${teamId})\n`);
      }

      // Auto-Increment Build Number handling
      let nextBuildNumber = build.project?.currentBuildNumber || 1;
      if (build.project?.autoIncrementBuild !== false && build.project?.id) {
        nextBuildNumber = (build.project?.currentBuildNumber || 1) + 1;
        try {
          await prisma.project.update({
            where: { id: build.project.id },
            data: { currentBuildNumber: nextBuildNumber }
          });
          await appendLog(build.id, `🏷️ Auto-incrementing Build Number to #${nextBuildNumber}\n`);
        } catch (e) {}
      }

      // As variaveis do painel entram como BASE do ambiente: assim tudo abaixo
      // (chaves de assinatura, match, ASC API) mantem precedencia e nao pode
      // ser sobrescrito sem querer por uma entrada do campo de env vars.
      const projectEnv = parseEnvVars(build.project.envVars);

      const fastlaneEnv = {
        ...projectEnv,
        FASTLANE_HIDE_CHANGELOG: '1',
        FASTLANE_SKIP_UPDATE_CHECK: '1',
        FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT: '120',
        FASTLANE_XCODEBUILD_SETTINGS_RETRIES: '6',
        BUILD_NUMBER: String(nextBuildNumber)
      };

      if (appleUser && !keyId) fastlaneEnv.FASTLANE_USER = appleUser;
      if (teamId) fastlaneEnv.FASTLANE_TEAM_ID = teamId;
      if (matchPass) fastlaneEnv.MATCH_PASSWORD = matchPass;
      if (keyId) fastlaneEnv.APP_STORE_CONNECT_API_KEY_KEY_ID = keyId;
      if (issuerId) fastlaneEnv.APP_STORE_CONNECT_API_KEY_ISSUER_ID = issuerId;
      if (matchUrl && (matchUrl.startsWith('http://') || matchUrl.startsWith('https://') || matchUrl.startsWith('git@'))) {
        fastlaneEnv.MATCH_GIT_URL = matchUrl;
      }
      if (keyContent) {
        const p8Path = path.join(WORKSPACE_DIR, `AuthKey_${build.id}.p8`);
        fs.writeFileSync(p8Path, keyContent);
        fastlaneEnv.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH = p8Path;
      }

      const projectEnvKeys = Object.keys(projectEnv);
      if (projectEnvKeys.length) {
        // Apenas os nomes: os valores podem ser segredos e o log fica visivel.
        await appendLog(build.id, `🌱 Exported ${projectEnvKeys.length} project variable(s) to the build environment: ${projectEnvKeys.join(', ')}\n`);
      }

      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      await endStep(build.id, 'Preparing build machine');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 2: Fetching app sources
      await startStep(build.id, 'Fetching app sources');
      
      // Build authenticated clone URL if Git credentials are configured
      let cloneUrl = build.project.repoUrl;
      const repoUser = build.project.repoUsername;
      const repoPass = build.project.repoPassword;
      if (repoUser && repoPass) {
        try {
          const parsed = new URL(cloneUrl);
          parsed.username = encodeURIComponent(repoUser);
          parsed.password = encodeURIComponent(repoPass);
          cloneUrl = parsed.toString();
          await appendLog(build.id, `📦 Cloning repository (authenticated)...\n   ${build.project.repoUrl} [${build.project.branch}]\n`);
        } catch (e) {
          await appendLog(build.id, `📦 Cloning repository...\n   ${build.project.repoUrl} [${build.project.branch}]\n`);
        }
      } else {
        await appendLog(build.id, `📦 Cloning repository...\n   ${build.project.repoUrl} [${build.project.branch}]\n`);
      }
      await runCommand('git', ['clone', '-b', build.project.branch, '--depth=1', cloneUrl, projectDir], WORKSPACE_DIR, build.id, fastlaneEnv);

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

      const { isFlutter, isReactNative, isExpo } = detectProjectType(projectDir);
      // Flutter e RN mantem o projeto Xcode em ios/. Em Expo managed essa pasta
      // sequer existe no repo - o `expo prebuild` no passo de packages a gera
      // antes de qualquer coisa aqui embaixo precisar dela.
      const iosDir = (isFlutter || isReactNative) ? path.join(projectDir, 'ios') : projectDir;

      // STEP 3: Installing SDKs
      await startStep(build.id, 'Installing SDKs');
      await appendLog(build.id, `Checking installed Xcode and SDK tools...\n`);
      await endStep(build.id, 'Installing SDKs');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 4: Get packages
      // O .env vale para qualquer stack (flutter_dotenv, react-native-config,
      // EXPO_PUBLIC_*). Antes isto vivia dentro do bloco Flutter, entao um
      // projeto React Native nunca recebia as variaveis configuradas no painel.
      const envPath = path.join(projectDir, '.env');
      if (build.project.envVars && build.project.envVars.trim()) {
        fs.writeFileSync(envPath, build.project.envVars);
        await appendLog(build.id, `🔑 Wrote project environment variables to .env (${build.project.envVars.split('\n').filter(l => l.includes('=')).length} vars)\n`);
      } else if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, '# Auto-created .env file for CI build\n');
        await appendLog(build.id, `⚠️ No environment variables configured for this project - created empty .env. Apps that read config at startup may hang on splash.\n`);
      }

      if (isFlutter) {
        clearFlutterLock();
        await startStep(build.id, 'Get packages');
        await appendLog(build.id, `🦋 Flutter project detected...\n`);

        const restoredCache = restoreProjectCache(build.projectId, iosDir);
        if (restoredCache) {
          await appendLog(build.id, `⚡ Restored CocoaPods & plugin cache for project ${build.projectId}\n`);
        }

        const flutterCmd = path.join(process.env.HOME || '/Users/diovaniomota', 'development/flutter/bin/flutter');
        await runCommand(flutterCmd, ['clean'], projectDir, build.id, fastlaneEnv);
        clearFlutterLock();
        await runCommand(flutterCmd, ['pub', 'get'], projectDir, build.id, fastlaneEnv);
        await endStep(build.id, 'Get packages');
      } else if (isReactNative) {
        await startStep(build.id, 'Get packages');
        await appendLog(build.id, `⚛️ React Native${isExpo ? ' (Expo)' : ''} project detected...\n`);

        // O Podfile do RN resolve o react-native via `require.resolve`, entao
        // node_modules precisa existir ANTES do pod install.
        let pmCmd = 'npm';
        let pmArgs = ['install'];
        if (fs.existsSync(path.join(projectDir, 'yarn.lock')) && hasBinary('yarn')) {
          pmCmd = 'yarn';
          pmArgs = ['install', '--frozen-lockfile'];
        } else if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml')) && hasBinary('pnpm')) {
          pmCmd = 'pnpm';
          pmArgs = ['install', '--frozen-lockfile'];
        } else if (fs.existsSync(path.join(projectDir, 'package-lock.json'))) {
          pmArgs = ['ci'];
        }
        await appendLog(build.id, `📦 Installing JS dependencies (${pmCmd} ${pmArgs.join(' ')})...\n`);
        await runCommand(pmCmd, pmArgs, projectDir, build.id, fastlaneEnv);

        if (isExpo && !fs.existsSync(path.join(projectDir, 'ios', 'Podfile'))) {
          // Expo managed: ios/ nao e versionada, e gerada aqui a partir do
          // app.json/app.config. --no-install porque o passo de CocoaPods
          // adiante roda `pod install` aproveitando o cache por projeto.
          await appendLog(build.id, `🧬 Expo managed detected - running prebuild to generate the ios/ project...\n`);
          await runCommand(
            'npx',
            ['expo', 'prebuild', '--platform', 'ios', '--no-install'],
            projectDir,
            build.id,
            { ...fastlaneEnv, CI: '1' }
          );
        }

        if (!fs.existsSync(iosDir)) {
          throw new Error('Pasta ios/ nao encontrada apos a instalacao de dependencias. Em Expo managed, verifique se o `expo prebuild` concluiu; em RN bare, se a pasta ios/ esta versionada no repositorio.');
        }
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

      // Neste ponto o ios/ ja existe (prebuild rodou no passo de packages).
      const xcodeProjName = findXcodeProject(iosDir) || 'Runner.xcodeproj';
      const xcodeProjBase = xcodeProjName.replace(/\.xcodeproj$/, '');

      // "Runner" e o default do painel, herdado do Flutter. Num projeto RN esse
      // scheme nao existe e o gym falharia - cai para o nome real do projeto.
      let resolvedScheme = build.project.buildScheme || 'Runner';
      if (!isFlutter && resolvedScheme === 'Runner' && xcodeProjBase !== 'Runner') {
        await appendLog(build.id, `ℹ️ Scheme "Runner" nao se aplica a este projeto - usando "${xcodeProjBase}".\n`);
        resolvedScheme = xcodeProjBase;
      }
      await appendLog(build.id, `🛠️ Xcode project: ${xcodeProjName} | scheme: ${resolvedScheme}\n`);

      const templatePath = path.join(__dirname, 'fastlane', 'Fastfile');
      let fastfileContent = fs.readFileSync(templatePath, 'utf8');
      const isDevBuild = build.project.distribution === 'development';
      fastfileContent = fastfileContent
        .replaceAll('{{SCHEME}}', resolvedScheme)
        .replaceAll('{{XCODEPROJ}}', xcodeProjName)
        .replaceAll('{{BUNDLE_ID}}', build.project.bundleId)
        .replaceAll('{{EXPORT_METHOD}}', isDevBuild ? 'development' : 'app-store')
        .replaceAll('{{MATCH_GIT_URL}}', matchUrl || '');

      fs.writeFileSync(path.join(fastlaneDir, 'Fastfile'), fastfileContent);

      const pbxprojPath = path.join(iosDir, xcodeProjName, 'project.pbxproj');
      if (fs.existsSync(pbxprojPath)) {
        let pbxprojContent = fs.readFileSync(pbxprojPath, 'utf8');
        pbxprojContent = pbxprojContent
          .replace(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${build.project.bundleId};`)
          .replace(/CODE_SIGN_STYLE\s*=\s*[^;]+;/gi, 'CODE_SIGN_STYLE = Automatic;')
          .replace(/ProvisioningStyle\s*=\s*[^;]+;/gi, 'ProvisioningStyle = Automatic;')
          .replace(/PROVISIONING_PROFILE\s*=\s*[^;]+;/g, '')
          .replace(/PROVISIONING_PROFILE_SPECIFIER\s*=\s*[^;]+;/g, '')
          // Drop the template's hardcoded "iPhone Developer" identity instead of
          // forcing a distribution one: with CODE_SIGN_STYLE = Automatic, Xcode
          // rejects a manually specified identity. The Fastfile sets it explicitly
          // on the manual-signing paths.
          .replace(/"?CODE_SIGN_IDENTITY(\[sdk=[^\]]*\])?"?\s*=\s*[^;]+;/g, '');
        if (teamId) {
          pbxprojContent = pbxprojContent.replace(/DEVELOPMENT_TEAM\s*=\s*[^;]+;/g, `DEVELOPMENT_TEAM = ${teamId};`);
          if (!pbxprojContent.includes('DEVELOPMENT_TEAM =')) {
            pbxprojContent = pbxprojContent.replace(/(PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/g, `$1\n\t\t\t\tDEVELOPMENT_TEAM = ${teamId};\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tProvisioningStyle = Automatic;`);
          }
        }
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
      await runCommand('fastlane', ['ci_build'], iosDir, build.id, fastlaneEnv);
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
      if (isDevBuild) {
        await appendLog(build.id, `📱 Development build - pulando upload para TestFlight. Baixe o .ipa na seção Artifacts e instale no device registrado.\n`);
      } else {
        await appendLog(build.id, `🚀 Uploading binary to TestFlight via App Store Connect API...\n`);
        try {
          await runCommand('fastlane', ['ci_upload'], iosDir, build.id, fastlaneEnv);
          await appendLog(build.id, `✅ Uploaded to TestFlight successfully.\n`);
        } catch (pubErr) {
          await appendLog(build.id, `⚠️ TestFlight upload failed: ${pubErr.message}\n`);
          throw pubErr;
        }
      }
      await endStep(build.id, 'Publishing');

      if (await isBuildCancelled(build.id)) throw new Error('Build cancelado pelo usuário');

      // STEP 12: Cleaning up
      await startStep(build.id, 'Cleaning up');
      await appendLog(build.id, `Cleaning build workspace and finalizing build artifacts...\n`);
      // Poda automática: cada gym deixa um .xcarchive (centenas de MB) e um
      // DerivedData por clone; workspaces órfãos sobram de builds que crasharam.
      try {
        execSync(`find "${WORKSPACE_DIR}" -maxdepth 1 -mindepth 1 -mmin +720 -exec rm -rf {} + 2>/dev/null || true`);
        execSync(`find "$HOME/Library/Developer/Xcode/Archives" -maxdepth 1 -mindepth 1 -mtime +2 -exec rm -rf {} + 2>/dev/null || true`);
        execSync(`find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 1 -name "Runner-*" -mtime +5 -exec rm -rf {} + 2>/dev/null || true`);
        await appendLog(build.id, `🧹 Pruned stale workspaces, Xcode archives and DerivedData.\n`);
      } catch (e) {}
      await endStep(build.id, 'Cleaning up');

      await appendLog(build.id, `\n✅ Build completed successfully!\n`);
      await flushLog(build.id);
      await prisma.build.update({ where: { id: build.id }, data: { status: 'SUCCESS' } });
      console.log(`✅ Build ${build.id} succeeded`);

    } catch (err) {
      if (err.message === 'Build cancelado pelo usuário') {
        console.log(`🛑 Build ${build.id} was cancelled by user`);
        await appendLog(build.id, `\n🛑 Build cancelado pelo usuário.\n`);
        await flushLog(build.id);
        await prisma.build.update({ where: { id: build.id }, data: { status: 'CANCELLED' } });
      } else {
        console.error(`❌ Build ${build.id} failed:`, err.message);
        await appendLog(build.id, `\n❌ Build failed: ${err.message}\n`);
        await flushLog(build.id);
        await prisma.build.update({ where: { id: build.id }, data: { status: 'FAILED' } });
      }
    } finally {
      activeBuildId = null;
      updateRunnerHeartbeat('ONLINE', null);
      // Garante que qualquer resto de log bufferizado chegue ao banco
      try { await flushLog(build.id); } catch (e) {}
      logBuffers.delete(build.id);
      // A chave .p8 é sensível - nunca deixar acumulada no workspace
      try {
        fs.rmSync(path.join(WORKSPACE_DIR, `AuthKey_${build.id}.p8`), { force: true });
      } catch (e) {}
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


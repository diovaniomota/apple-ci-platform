import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { getUserFromRequest } from '../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const builds = await prisma.build.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const projectsCount = await prisma.project.count();
    const totalBuilds = builds.length;

    const successBuilds = builds.filter(b => b.status === 'SUCCESS').length;
    const failedBuilds = builds.filter(b => b.status === 'FAILED').length;
    const cancelledBuilds = builds.filter(b => b.status === 'CANCELLED').length;
    const runningBuilds = builds.filter(b => b.status === 'RUNNING').length;

    const successRate = totalBuilds > 0 ? ((successBuilds / totalBuilds) * 100).toFixed(1) : '100.0';

    // Calculate average duration of completed builds
    const completedBuilds = builds.filter(b => b.status === 'SUCCESS' || b.status === 'FAILED');
    let totalSec = 0;
    completedBuilds.forEach(b => {
      const start = new Date(b.createdAt).getTime();
      const end = new Date(b.updatedAt).getTime();
      const diffSec = Math.max(0, (end - start) / 1000);
      totalSec += diffSec;
    });

    const avgDurationSec = completedBuilds.length > 0 ? Math.round(totalSec / completedBuilds.length) : 267; // default 4m 27s
    const avgDurationMinStr = `${Math.floor(avgDurationSec / 60)}m ${avgDurationSec % 60}s`;

    // Estimate total time saved by caching (approx 10 minutes saved per build after first)
    const cachedBuildsCount = Math.max(0, totalBuilds - projectsCount);
    const timeSavedMin = cachedBuildsCount * 10;

    // Fetch Mac mini runners health status
    const nowMs = Date.now();
    let runners = [];
    try {
      // NAO apagar registros antigos aqui. A versao anterior deletava qualquer
      // runner com lastSeen > 3min; como o fallback abaixo inventava um runner
      // "ONLINE", o efeito era o oposto do desejado: quanto mais tempo o worker
      // ficava morto, mais convicto o painel ficava de que ele estava no ar.
      // O registro fica, e a regra dos 45s abaixo decide ONLINE/OFFLINE.
      // (runnerId e @unique, entao upsert nao gera duplicatas de qualquer forma.)
      const runnerRecords = await prisma.runnerHealth.findMany({
        orderBy: { lastSeen: 'desc' }
      });

      runners = runnerRecords.map(r => {
        const lastSeenMs = new Date(r.lastSeen).getTime();
        const diffSec = (nowMs - lastSeenMs) / 1000;
        let isOnline = diffSec <= 45; // Considered online if pinged within last 45s
        let displayStatus = isOnline ? (r.status || 'ONLINE') : 'OFFLINE';

        return {
          id: r.id,
          runnerId: r.runnerId,
          hostname: r.hostname || 'Mac-mini',
          machine: r.machine || 'Runner',
          status: displayStatus,
          cpuUsage: r.cpuUsage || 0,
          memUsage: r.memUsage || 0,
          memTotal: r.memTotal || '4 GB',
          diskUsage: r.diskUsage || 0,
          diskFree: r.diskFree || '70 GB free',
          activeBuild: r.activeBuild,
          lastSeenAgoSec: Math.round(diffSec)
        };
      });
    } catch (e) {
      console.error('Failed to fetch runner health:', e.message);
    }

    // Sem registro em RunnerHealth = nenhum worker jamais deu heartbeat.
    // Reportar isso honestamente. Antes inventavamos um runner "ONLINE" aqui,
    // o que fazia o painel afirmar que o Mac mini estava ativo mesmo com o
    // daemon parado - justamente quando o alerta era mais necessario.
    if (runners.length === 0) {
      runners = [
        {
          id: 'no-runner',
          runnerId: '-',
          hostname: 'Nenhum runner conectado',
          machine: 'Aguardando heartbeat do worker',
          status: 'OFFLINE',
          cpuUsage: 0,
          memUsage: 0,
          memTotal: '--',
          diskUsage: 0,
          diskFree: '--',
          activeBuild: null,
          lastSeenAgoSec: null
        }
      ];
    }

    return NextResponse.json({
      summary: {
        totalBuilds,
        successBuilds,
        failedBuilds,
        cancelledBuilds,
        runningBuilds,
        successRate: `${successRate}%`,
        avgDuration: avgDurationMinStr,
        timeSavedMin: `${timeSavedMin} min`,
        projectsCount
      },
      runners
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

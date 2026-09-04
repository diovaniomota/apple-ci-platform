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

    // Taxa sobre builds CONCLUIDOS. Antes o denominador era o total, o que
    // contava cancelamentos - acao deliberada do usuario - como se fossem
    // falhas do pipeline, e contradizia o proprio card, que exibe
    // "N Sucessos - M Falhas". Com 14/117 dava 12%; com 14/66, 21.2%.
    const finishedBuilds = successBuilds + failedBuilds;
    const successRate = finishedBuilds > 0 ? ((successBuilds / finishedBuilds) * 100).toFixed(1) : '0.0';

    // Calculate average duration of completed builds
    const completedBuilds = builds.filter(b => b.status === 'SUCCESS' || b.status === 'FAILED');
    let totalSec = 0;
    completedBuilds.forEach(b => {
      const start = new Date(b.createdAt).getTime();
      const end = new Date(b.updatedAt).getTime();
      const diffSec = Math.max(0, (end - start) / 1000);
      totalSec += diffSec;
    });

    const avgDurationSec = completedBuilds.length > 0 ? Math.round(totalSec / completedBuilds.length) : 0;
    const formatDur = (sec) => `${Math.floor(sec / 60)}m ${sec % 60}s`;

    // A MEDIA e inutil aqui: alguns builds ficaram horas parados antes de serem
    // atualizados, e um deles marca 2692 minutos. Isso puxava a media para 67m
    // enquanto a mediana real era 4m21s. A mediana e robusta a esses outliers.
    //
    // Nota: sem coluna startedAt no schema, a duracao e updatedAt - createdAt,
    // ou seja, inclui o tempo na FILA antes do runner assumir. Nao e tempo de
    // compilacao puro - o rotulo na interface diz isso explicitamente.
    const ordenadas = completedBuilds
      .map(b => Math.max(0, (new Date(b.updatedAt).getTime() - new Date(b.createdAt).getTime()) / 1000))
      .sort((a, b) => a - b);
    const medianDurationSec = ordenadas.length
      ? Math.round(ordenadas[Math.floor(ordenadas.length / 2)])
      : 0;

    // REMOVIDO: "tempo economizado pelo cache" era (totalBuilds - projectsCount) * 10,
    // isto e, 10 minutos inventados por build, sem medir cache algum - e contando
    // ate builds cancelados e falhados como economia. Era um numero fabricado
    // exibido como metrica medida. Nao ha dado no schema que permita calcular
    // isso de verdade; medir exigiria registrar hits/misses de cache por build.

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
          hostname: r.hostname || '--',
          machine: r.machine || 'Runner',
          status: displayStatus,
          cpuUsage: r.cpuUsage || 0,
          memUsage: r.memUsage || 0,
          memTotal: r.memTotal || '--',
          diskUsage: r.diskUsage || 0,
          diskFree: r.diskFree || '--',
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
        avgDuration: formatDur(avgDurationSec),
        medianDuration: formatDur(medianDurationSec),
        projectsCount
      },
      runners
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

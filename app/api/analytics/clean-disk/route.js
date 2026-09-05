import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// Solicita uma limpeza de disco ao runner.
//
// A versao anterior tentava apagar os diretorios aqui mesmo, com
// `path.join(process.cwd(), 'builds-workspace')`. So que esta rota roda como
// funcao serverless na Vercel: o cwd e /var/task, efemero, e nao tem relacao
// nenhuma com o Mac onde os builds acontecem. Os `fs.existsSync` davam false,
// os dois blocos eram pulados e a resposta ainda era `success: true` com
// "Cleanup executed successfully" - o painel confirmava uma limpeza que jamais
// aconteceu. Funcionava so em `next dev` na propria maquina, que e por onde o
// problema provavelmente passou despercebido.
//
// Agora o pedido e gravado em Setting e o runner - que roda no Mac e ja tem a
// rotina pronta - executa no seu ciclo de verificacao.
export async function POST(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  try {
    const agora = new Date().toISOString();

    await prisma.setting.upsert({
      where: { key: 'CLEANUP_REQUESTED_AT' },
      update: { value: agora },
      create: { key: 'CLEANUP_REQUESTED_AT', value: agora }
    });

    // Se nenhum runner estiver online, o pedido fica registrado mas ninguem o
    // executa. Dizer isso e melhor do que prometer uma limpeza que nao vira.
    const runner = await prisma.runnerHealth.findFirst({ orderBy: { lastSeen: 'desc' } });
    const online = runner && (Date.now() - new Date(runner.lastSeen).getTime()) / 1000 <= 45;

    return NextResponse.json({
      success: true,
      requestedAt: agora,
      runnerOnline: Boolean(online),
      message: online
        ? 'Limpeza solicitada ao runner. Deve concluir em alguns segundos - use "Atualizar Agora" para ver o disco.'
        : 'Limpeza registrada, mas nenhum runner esta online. Ela sera executada assim que um se conectar.'
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Consulta o resultado da ultima limpeza executada pelo runner.
export async function GET(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  try {
    const chaves = await prisma.setting.findMany({
      where: { key: { in: ['CLEANUP_REQUESTED_AT', 'CLEANUP_DONE_AT', 'CLEANUP_LAST_RESULT'] } }
    });
    const mapa = Object.fromEntries(chaves.map((s) => [s.key, s.value]));

    const pedido = mapa.CLEANUP_REQUESTED_AT ?? null;
    const conclusao = mapa.CLEANUP_DONE_AT ?? null;

    return NextResponse.json({
      requestedAt: pedido,
      doneAt: conclusao,
      // O worker passou a gravar o resultado como JSON ({ itens: N }); versoes
      // anteriores gravavam o numero cru. Aceita os dois formatos.
      itemsRemoved: (() => {
        const bruto = mapa.CLEANUP_LAST_RESULT;
        if (!bruto) return null;
        try { const j = JSON.parse(bruto); return typeof j === 'object' ? (j.itens ?? null) : Number(j); }
        catch (e) { return Number(bruto); }
      })(),
      pending: Boolean(pedido && (!conclusao || conclusao < pedido))
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

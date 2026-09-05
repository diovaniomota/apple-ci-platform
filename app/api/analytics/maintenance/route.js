import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// Manutencao sob demanda executada pelo runner.
//
// Esta rota roda na Vercel e nao tem acesso nenhum a maquina de build - nem ao
// disco, nem aos processos. Ela apenas registra o pedido em Setting; quem
// executa e o worker, que roda no Mac. Mesmo padrao da limpeza de disco.
//
// Sobre o que estas acoes realmente fazem, para nao prometerem o que nao entregam:
//
// - 'memory' NAO "limpa RAM". O macOS gerencia memoria sozinho e `purge` exige
//   root e apenas descarta cache de disco util, que e reconstruido logo depois.
//   O que de fato prende memoria numa maquina de CI sao processos de build
//   orfaos, restos de execucoes que falharam. E esses que a acao encerra.
//
// - 'cpu' NAO "otimiza CPU" - isso nao existe como operacao. Ela procura
//   processos de build consumindo CPU sem que haja build algum (um fastlane
//   travado ja consumiu 57 minutos de CPU nesta maquina) e os encerra.
const ACOES = {
  memory: 'MEMORY',
  cpu: 'CPU'
};

export async function POST(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  try {
    const { action } = await request.json();
    const prefixo = ACOES[action];
    if (!prefixo) {
      return NextResponse.json({ error: `Acao invalida: ${action}` }, { status: 400 });
    }

    const agora = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: `${prefixo}_REQUESTED_AT` },
      update: { value: agora },
      create: { key: `${prefixo}_REQUESTED_AT`, value: agora }
    });

    const runner = await prisma.runnerHealth.findFirst({ orderBy: { lastSeen: 'desc' } });
    const online = runner && (Date.now() - new Date(runner.lastSeen).getTime()) / 1000 <= 45;

    return NextResponse.json({
      success: true,
      requestedAt: agora,
      runnerOnline: Boolean(online),
      message: online
        ? 'Solicitado ao runner. Deve concluir em alguns segundos.'
        : 'Registrado, mas nenhum runner esta online. Sera executado quando um se conectar.'
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  try {
    const action = request.nextUrl.searchParams.get('action');
    const prefixo = ACOES[action];
    if (!prefixo) {
      return NextResponse.json({ error: `Acao invalida: ${action}` }, { status: 400 });
    }

    const linhas = await prisma.setting.findMany({
      where: { key: { in: [`${prefixo}_REQUESTED_AT`, `${prefixo}_DONE_AT`, `${prefixo}_LAST_RESULT`] } }
    });
    const mapa = Object.fromEntries(linhas.map((s) => [s.key, s.value]));

    const pedido = mapa[`${prefixo}_REQUESTED_AT`] ?? null;
    const conclusao = mapa[`${prefixo}_DONE_AT`] ?? null;

    let resultado = null;
    try {
      resultado = mapa[`${prefixo}_LAST_RESULT`] ? JSON.parse(mapa[`${prefixo}_LAST_RESULT`]) : null;
    } catch (e) {
      resultado = null;
    }

    return NextResponse.json({
      requestedAt: pedido,
      doneAt: conclusao,
      result: resultado,
      pending: Boolean(pedido && (!conclusao || conclusao < pedido))
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

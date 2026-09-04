import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/auth';
import { redactAppleAccount } from '../../../lib/redact';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const account = await prisma.appleAccount.findUnique({
      where: { id: params.id },
      include: {
        projects: { select: { id: true, name: true, bundleId: true } }
      }
    });

    if (!account) {
      return NextResponse.json({ error: 'Apple account not found' }, { status: 404 });
    }

    return NextResponse.json(redactAppleAccount(account));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const body = await request.json();
    const {
      name,
      appleId,
      teamId,
      ascKeyId,
      ascIssuerId,
      ascKeyContent,
      matchGitUrl,
      matchPassword
    } = body;

    const account = await prisma.appleAccount.update({
      where: { id: params.id },
      data: {
        name,
        appleId: appleId || null,
        teamId: teamId ? teamId.trim() : undefined,
        ascKeyId: ascKeyId !== undefined ? (ascKeyId ? ascKeyId.trim() : null) : undefined,
        ascIssuerId: ascIssuerId !== undefined ? (ascIssuerId ? ascIssuerId.trim() : null) : undefined,
        // Segredo write-only: campo em branco significa "nao alterar", nunca
        // "apagar". A API nao devolve mais o valor atual (ver lib/redact.js),
        // entao o formulario chega vazio - grava-lo destruiria a credencial em uso.
        ascKeyContent: ascKeyContent ? ascKeyContent : undefined,
        matchGitUrl: matchGitUrl !== undefined ? (matchGitUrl ? matchGitUrl.trim() : null) : undefined,
        // Segredo write-only: campo em branco significa "nao alterar", nunca
        // "apagar". A API nao devolve mais o valor atual (ver lib/redact.js),
        // entao o formulario chega vazio - grava-lo destruiria a credencial em uso.
        matchPassword: matchPassword ? matchPassword : undefined
      }
    });

    return NextResponse.json(redactAppleAccount(account));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    // Unlink any projects linked to this account before deletion
    await prisma.project.updateMany({
      where: { appleAccountId: params.id },
      data: { appleAccountId: null }
    });

    await prisma.appleAccount.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ message: 'Apple account deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

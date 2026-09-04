import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { getUserFromRequest } from '../../lib/auth';
import { redactAppleAccount } from '../../lib/redact';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const accounts = await prisma.appleAccount.findMany({
      include: {
        projects: {
          select: { id: true, name: true, bundleId: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(accounts.map(redactAppleAccount));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
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

    if (!name || !teamId) {
      return NextResponse.json({ error: 'Name and Team ID are required' }, { status: 400 });
    }

    const account = await prisma.appleAccount.create({
      data: {
        name,
        appleId: appleId || null,
        teamId: teamId.trim(),
        ascKeyId: ascKeyId ? ascKeyId.trim() : null,
        ascIssuerId: ascIssuerId ? ascIssuerId.trim() : null,
        ascKeyContent: ascKeyContent || null,
        matchGitUrl: matchGitUrl ? matchGitUrl.trim() : null,
        matchPassword: matchPassword || null
      }
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await prisma.appleAccount.findMany({
      include: {
        projects: {
          select: { id: true, name: true, bundleId: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(accounts);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
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

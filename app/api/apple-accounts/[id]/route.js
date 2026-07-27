import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
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

    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
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
        ascKeyContent: ascKeyContent !== undefined ? ascKeyContent : undefined,
        matchGitUrl: matchGitUrl !== undefined ? (matchGitUrl ? matchGitUrl.trim() : null) : undefined,
        matchPassword: matchPassword !== undefined ? matchPassword : undefined
      }
    });

    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
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

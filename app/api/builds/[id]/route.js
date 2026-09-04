import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/auth';

export async function GET(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const build = await prisma.build.findUnique({
      where: { id: params.id },
      include: {
        project: {
          include: {
            appleAccount: true
          }
        }
      }
    });

    if (!build) return NextResponse.json({ error: 'Build not found' }, { status: 404 });

    // Calculate real sequential build index for this project
    const buildIndex = await prisma.build.count({
      where: {
        projectId: build.projectId,
        createdAt: { lte: build.createdAt }
      }
    });

    // Fetch settings
    const machineSetting = await prisma.setting.findUnique({ where: { key: 'WORKER_MACHINE_NAME' } });

    const appleAccountEmail = build.project?.appleAccount?.appleId || 'Nenhuma conta vinculada';
    const machine = machineSetting?.value || build.machine || 'Runner';

    return NextResponse.json({
      ...build,
      buildIndex,
      appleAccountEmail,
      startedBy: appleAccountEmail,
      machine
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch build' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const body = await request.json();
    if (body.action === 'cancel') {
      const build = await prisma.build.findUnique({ where: { id: params.id } });
      if (!build) return NextResponse.json({ error: 'Build not found' }, { status: 404 });

      if (build.status === 'RUNNING' || build.status === 'PENDING') {
        const updated = await prisma.build.update({
          where: { id: params.id },
          data: {
            status: 'CANCELLED',
            logs: (build.logs || '') + '\n\n🛑 Build cancelado pelo usuário.\n'
          }
        });
        return NextResponse.json(updated);
      }
      return NextResponse.json({ message: 'Build cannot be cancelled' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update build' }, { status: 500 });
  }
}

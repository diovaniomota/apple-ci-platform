import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

function getMachineName() {
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
    return modelName;
  } catch (e) {
    return 'Mac mini';
  }
}

export async function GET(request, { params }) {
  try {
    const build = await prisma.build.findUnique({
      where: { id: params.id },
      include: { project: true }
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
    const appleIdSetting = await prisma.setting.findUnique({ where: { key: 'APPLE_ID' } });
    const machineSetting = await prisma.setting.findUnique({ where: { key: 'WORKER_MACHINE_NAME' } });

    const startedBy = appleIdSetting?.value || 'diovaniomotaa@gmail.com';
    const machine = machineSetting?.value || getMachineName();

    return NextResponse.json({
      ...build,
      buildIndex,
      startedBy,
      machine
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch build' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
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

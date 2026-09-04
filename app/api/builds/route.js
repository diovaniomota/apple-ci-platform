import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { getUserFromRequest } from '../../lib/auth';

export async function POST(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const body = await request.json();
    const { projectId } = body;
    
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Create a new PENDING build
    const build = await prisma.build.create({
      data: {
        projectId,
        status: 'PENDING',
        logs: 'Build queued...\n'
      }
    });
    
    return NextResponse.json(build);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to trigger build' }, { status: 500 });
  }
}

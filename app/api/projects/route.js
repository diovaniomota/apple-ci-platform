import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { getUserFromRequest } from '../../lib/auth';
import { redactProject } from '../../lib/redact';

export async function GET(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const projects = await prisma.project.findMany({
      include: {
        appleAccount: true,
        builds: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(projects.map(redactProject));
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const body = await request.json();
    const { name, repoUrl, repoUsername, repoPassword, branch, buildScheme, bundleId, appleAccountId, distribution } = body;

    if (!name || !repoUrl) {
      return NextResponse.json({ error: 'Name and repoUrl are required' }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name,
        repoUrl,
        repoUsername: repoUsername || null,
        repoPassword: repoPassword || null,
        branch: branch || 'main',
        buildScheme: buildScheme || 'Runner',
        bundleId: bundleId || 'com.example.app',
        appleAccountId: appleAccountId || null,
        distribution: distribution === 'development' ? 'development' : 'testflight',
        envVars: typeof body.envVars === 'string' ? body.envVars : ''
      },
      include: {
        appleAccount: true
      }
    });
    
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

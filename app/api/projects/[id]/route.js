import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/auth';
import { redactProject } from '../../../lib/redact';

export async function GET(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        appleAccount: true,
        builds: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json(redactProject(project));
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    const body = await request.json();
    const updatedProject = await prisma.project.update({
      where: { id: params.id },
      data: {
        name: body.name,
        repoUrl: body.repoUrl,
        repoUsername: body.repoUsername !== undefined ? (body.repoUsername || null) : undefined,
        // Segredo write-only: campo em branco significa "nao alterar", nunca
        // "apagar". A API nao devolve mais o valor atual (ver lib/redact.js),
        // entao o formulario chega vazio - grava-lo destruiria a credencial em uso.
        repoPassword: body.repoPassword ? body.repoPassword : undefined,
        branch: body.branch,
        bundleId: body.bundleId,
        buildScheme: body.buildScheme,
        appleAccountId: body.appleAccountId !== undefined ? (body.appleAccountId || null) : undefined,
        autoIncrementBuild: body.autoIncrementBuild !== undefined ? Boolean(body.autoIncrementBuild) : undefined,
        currentBuildNumber: body.currentBuildNumber !== undefined ? parseInt(body.currentBuildNumber, 10) : undefined,
        distribution: body.distribution === 'development' ? 'development' : (body.distribution === 'testflight' ? 'testflight' : undefined),
        envVars: typeof body.envVars === 'string' ? body.envVars : undefined,
      },
      include: {
        appleAccount: true
      }
    });
    return NextResponse.json(updatedProject);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const usuario = await getUserFromRequest(request);
  if (!usuario) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  try {
    // Delete all builds first (cascade)
    await prisma.build.deleteMany({
      where: { projectId: params.id }
    });
    
    await prisma.project.delete({
      where: { id: params.id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request, { params }) {
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
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const updatedProject = await prisma.project.update({
      where: { id: params.id },
      data: {
        name: body.name,
        repoUrl: body.repoUrl,
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

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        builds: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, repoUrl, branch, buildScheme, bundleId } = body;
    
    if (!name || !repoUrl) {
      return NextResponse.json({ error: 'Name and repoUrl are required' }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name,
        repoUrl,
        branch: branch || 'main',
        buildScheme: buildScheme || 'App',
        bundleId: bundleId || 'com.example.app'
      }
    });
    
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

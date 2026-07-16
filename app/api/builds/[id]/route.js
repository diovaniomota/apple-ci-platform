import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request, { params }) {
  try {
    const build = await prisma.build.findUnique({
      where: { id: params.id },
      include: { project: true }
    });
    
    if (!build) return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    return NextResponse.json(build);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch build' }, { status: 500 });
  }
}

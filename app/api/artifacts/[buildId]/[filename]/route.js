import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  try {
    const { buildId, filename } = params;
    const artifactPath = path.join(process.cwd(), 'public/artifacts', buildId, filename);

    if (!fs.existsSync(artifactPath)) {
      return NextResponse.json({ error: 'Artifact file not found' }, { status: 404 });
    }

    const fileStream = fs.readFileSync(artifactPath);
    const contentType = filename.endsWith('.ipa') ? 'application/octet-stream' : 'application/zip';

    return new NextResponse(fileStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to download artifact' }, { status: 500 });
  }
}

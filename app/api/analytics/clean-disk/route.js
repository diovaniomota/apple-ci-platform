import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const workspaceDir = path.join(process.cwd(), 'builds-workspace');
    const artifactsDir = path.join(process.cwd(), 'public', 'artifacts');
    let itemsRemoved = 0;
    const now = Date.now();

    if (fs.existsSync(workspaceDir)) {
      const files = fs.readdirSync(workspaceDir);
      for (const file of files) {
        const fullPath = path.join(workspaceDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory() || file.startsWith('AuthKey_')) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            itemsRemoved++;
          }
        } catch (e) {}
      }
    }

    if (fs.existsSync(artifactsDir)) {
      const artFiles = fs.readdirSync(artifactsDir);
      for (const file of artFiles) {
        const fullPath = path.join(artifactsDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
            fs.unlinkSync(fullPath);
            itemsRemoved++;
          }
        } catch (e) {}
      }
    }

    return NextResponse.json({
      success: true,
      message: `SSD Disk Cleanup executed successfully. Cleaned ${itemsRemoved} items.`
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

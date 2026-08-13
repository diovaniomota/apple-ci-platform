import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

// Keys we allow (whitelist to avoid arbitrary writes)
const ALLOWED_KEYS = [
  'ASC_KEY_ID',
  'ASC_ISSUER_ID',
  'ASC_KEY_PATH',
  'ASC_KEY_CONTENT',
  'MATCH_GIT_URL',
  'MATCH_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_ID',
];

export async function GET() {
  try {
    const settings = await prisma.setting.findMany();
    // Return as object, mask sensitive values
    const result = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const updates = [];

    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      updates.push(
        prisma.setting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) }
        })
      );
    }

    await Promise.all(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

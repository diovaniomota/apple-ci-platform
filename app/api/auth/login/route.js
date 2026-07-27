import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'apple-ci-platform-super-secret-key-2026';

function hashPassword(password) {
  return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
}

function createJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if any user exists in database. If empty, seed initial admin user!
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('🌱 Seeding initial admin user into database...');
      await prisma.user.create({
        data: {
          email: 'admin@apple-ci.com',
          passwordHash: hashPassword('admin123'),
          name: 'Diovanio Mota (Admin)',
          role: 'ADMIN'
        }
      });
      // Also seed user-specified email if different
      if (cleanEmail !== 'admin@apple-ci.com') {
        await prisma.user.create({
          data: {
            email: cleanEmail,
            passwordHash: hashPassword(password),
            name: 'Administrador CI',
            role: 'ADMIN'
          }
        });
      }
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (!user) {
      return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
    }

    // Validate password hash
    const inputHash = hashPassword(password);
    if (user.passwordHash !== inputHash) {
      return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
    }

    // Generate JWT token payload
    const token = createJWT({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });

    // Set secure HttpOnly cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    });

    return response;

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

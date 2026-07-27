import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'apple-ci-platform-super-secret-key-2026';

function hashPassword(password) {
  return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
}

function verifyJWT(token) {
  if (!token) return null;
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

export async function PUT(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    const loggedUser = verifyJWT(token);

    if (!loggedUser) {
      return NextResponse.json({ error: 'Sessão não autorizada' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Senha atual e nova senha são obrigatórias' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'A nova senha deve ter no mínimo 6 caracteres' }, { status: 400 });
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { id: loggedUser.userId }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Verify current password
    const currentHash = hashPassword(currentPassword);
    if (user.passwordHash !== currentHash) {
      return NextResponse.json({ error: 'A senha atual está incorreta' }, { status: 400 });
    }

    // Update with new password hash
    const newHash = hashPassword(newPassword);
    await prisma.user.update({
      where: { id: loggedUser.userId },
      data: { passwordHash: newHash }
    });

    return NextResponse.json({ success: true, message: 'Senha alterada com sucesso!' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

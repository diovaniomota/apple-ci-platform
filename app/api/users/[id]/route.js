import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'apple-ci-platform-super-secret-key-2026';

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

export async function DELETE(request, { params }) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    const loggedUser = verifyJWT(token);

    if (!loggedUser) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (loggedUser.userId === params.id) {
      return NextResponse.json({ error: 'Você não pode excluir a sua própria conta ativa' }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

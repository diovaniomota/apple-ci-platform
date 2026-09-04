import { NextResponse } from 'next/server';
import { verifyToken } from './app/lib/auth';

// Rotas que respondem sem sessao.
//
// /api/webhooks  - chamado pelo GitHub, autentica por HMAC proprio (X-Hub-Signature-256)
// /api/artifacts - download do .ipa; publico hoje para nao quebrar instalacao OTA
// /api/auth/login - o proprio login
const PUBLICAS = [
  '/_next',
  '/api/webhooks',
  '/api/artifacts',
  '/api/auth/login',
  '/favicon',
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (PUBLICAS.some((p) => pathname.startsWith(p)) || pathname === '/login') {
    return NextResponse.next();
  }

  // A versao anterior verificava apenas `if (!authToken)`, isto e, se o cookie
  // existia - nunca a assinatura. Qualquer valor servia: `auth_token=x` dava
  // acesso a tudo que dependesse do middleware. Agora o token e validado.
  const usuario = await verifyToken(request.cookies.get('auth_token')?.value);

  if (!usuario) {
    // Para rotas de API, responder 401 em JSON. Redirecionar um fetch() para o
    // HTML do /login faz o cliente quebrar no res.json() com um erro confuso.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/projects/:path*',
    '/builds/:path*',
    '/analytics',
    '/settings',
    '/api/projects/:path*',
    '/api/builds/:path*',
    '/api/analytics/:path*',
    '/api/settings',
    // Estas faltavam no matcher e ficavam publicas. /api/apple-accounts servia
    // ascKeyContent (a chave privada .p8 da App Store Connect) e matchPassword
    // para qualquer visitante nao autenticado.
    '/api/apple-accounts/:path*',
    '/api/users/:path*',
    '/api/auth/:path*'
  ]
};

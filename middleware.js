import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const authToken = request.cookies.get('auth_token')?.value;

  // Allow static assets, images, next internals, and public API webhooks
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/artifacts') ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/favicon') ||
    pathname === '/login'
  ) {
    return NextResponse.next();
  }

  if (!authToken) {
    // Para rotas de API, responder 401 em JSON. Redirecionar um fetch() para o
    // HTML do /login faz o cliente quebrar no res.json() com um erro confuso.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
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

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

  // Redirect to /login if trying to access protected pages without auth_token
  if (!authToken) {
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
    '/api/settings'
  ]
};

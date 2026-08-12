import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

// First gate for the admin area (every /api/admin handler independently
// re-checks the session via requireAdmin — defense in depth). Runs on the
// edge runtime, so the JWT check is implemented here with jose directly.

const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-tt_admin' : 'tt_admin';

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret || secret.length < 32) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    });
    return payload.sub === 'admin';
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Login endpoints are the only unauthenticated admin surface.
  const isLoginPath = pathname === '/admin/login' || pathname === '/api/admin/login';
  const authed = await isAuthenticated(req);

  if (isLoginPath) {
    // Already signed in? Straight to the dashboard.
    if (authed && pathname === '/admin/login') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    return NextResponse.next();
  }

  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/admin/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

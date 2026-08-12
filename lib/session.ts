import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireEnv } from './env';

// Admin session: a short-lived HS256 JWT in an HttpOnly cookie. In production
// the __Host- prefix enforces Secure + Path=/ + no Domain attribute.

const isProd = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = isProd ? '__Host-tt_admin' : 'tt_admin';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h

function secretKey(): Uint8Array {
  const secret = requireEnv('SESSION_SECRET');
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    return payload.sub === 'admin';
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;

// Defense in depth: every admin API handler calls this itself, independently
// of the middleware gate. Returns null when authenticated, or a 401 response.
export async function requireAdmin(): Promise<NextResponse | null> {
  return (await isAdminSession()) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Same check for admin server components (pages can't return a 401 response).
export async function isAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return Boolean(token) && (await verifySessionToken(token as string));
}

// CSRF guard for state-changing admin routes: with a SameSite=Lax cookie the
// browser won't attach the session to cross-site POSTs, and this check
// rejects anything whose Origin / Sec-Fetch-Site says it came from elsewhere.
export function rejectCrossSite(req: Request): NextResponse | null {
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('host');
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  return null;
}

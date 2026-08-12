import { NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { verifyPassword } from '@/lib/password';
import { clientIp, isLoginBlocked, recordLoginAttempt } from '@/lib/ratelimit';
import { SESSION_COOKIE, createSessionToken, rejectCrossSite, sessionCookieOptions } from '@/lib/session';

export async function POST(req: Request) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;

  const ip = clientIp(req);

  try {
    if (await isLoginBlocked(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }
  } catch (err) {
    // Fail closed: if the rate limiter can't be consulted, don't allow guessing.
    console.error('Rate limit check failed:', err);
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 400 });
  }

  const valid =
    typeof password === 'string' &&
    password.length <= 1024 &&
    (await verifyPassword(password, requireEnv('ADMIN_PASSWORD_HASH')));

  await recordLoginAttempt(ip, valid);

  if (!valid) {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return res;
}

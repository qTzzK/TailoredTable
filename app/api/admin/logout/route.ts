import { NextResponse } from 'next/server';
import { SESSION_COOKIE, rejectCrossSite, requireAdmin, sessionCookieOptions } from '@/lib/session';

export async function POST(req: Request) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;

  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return res;
}

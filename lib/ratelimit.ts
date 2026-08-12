import 'server-only';
import { dbDelete, dbInsert, dbSelect } from './db';

// Serverless-safe login rate limiting backed by the login_attempts table
// (in-memory counters don't survive across lambda invocations).

const PER_IP_LIMIT = 5; // failures per IP per window
const PER_IP_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_LIMIT = 50; // failures across all IPs per window
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

export function clientIp(req: Request): string {
  // Vercel overwrites x-forwarded-for at its edge, so the first entry is
  // trustworthy there. Fallback for local dev.
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim();
  return ip && ip.length <= 60 ? ip : 'unknown';
}

export async function isLoginBlocked(ip: string): Promise<boolean> {
  const ipSince = new Date(Date.now() - PER_IP_WINDOW_MS).toISOString();
  const globalSince = new Date(Date.now() - GLOBAL_WINDOW_MS).toISOString();

  const [ipFailures, globalFailures] = await Promise.all([
    dbSelect<{ id: number }>(
      'login_attempts',
      `ip=eq.${encodeURIComponent(ip)}&success=eq.false&created_at=gte.${ipSince}&select=id&limit=${PER_IP_LIMIT}`
    ),
    dbSelect<{ id: number }>(
      'login_attempts',
      `success=eq.false&created_at=gte.${globalSince}&select=id&limit=${GLOBAL_LIMIT}`
    ),
  ]);

  return ipFailures.length >= PER_IP_LIMIT || globalFailures.length >= GLOBAL_LIMIT;
}

export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> {
  try {
    await dbInsert('login_attempts', { ip, success });
    if (success) {
      // Housekeeping on successful logins keeps the table tiny without a cron.
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await dbDelete('login_attempts', `created_at=lt.${dayAgo}`);
    }
  } catch (err) {
    console.error('Failed to record login attempt:', err);
  }
}

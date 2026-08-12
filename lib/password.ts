import 'server-only';
import { scrypt, timingSafeEqual } from 'node:crypto';

// Admin password verification. The hash lives in ADMIN_PASSWORD_HASH in the
// format produced by scripts/hash-password.mjs:
//   scrypt$<N>$<r>$<p>$<salt_base64>$<hash_base64>
// scrypt is memory-hard and built into Node, and the final comparison is
// constant-time.

function deriveKey(password: string, salt: Buffer, N: number, r: number, p: number, len: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, len, { N, r, p, maxmem: 512 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (!N || !r || !p || salt.length < 16 || expected.length < 32) return false;

    const actual = await deriveKey(password, salt, N, r, p, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

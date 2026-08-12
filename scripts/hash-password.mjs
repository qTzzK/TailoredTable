// Generates the ADMIN_PASSWORD_HASH environment variable value.
//
//   node scripts/hash-password.mjs "your-strong-password"
//
// Copy the printed line into the Vercel dashboard (and .env.local for dev).
// Also prints a fresh SESSION_SECRET you can use the first time.

import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: node scripts/hash-password.mjs "<password>"');
  console.error('Use at least 12 characters (a long random passphrase is best).');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });

console.log('\nAdd these to your environment (Vercel dashboard / .env.local):\n');
console.log(`ADMIN_PASSWORD_HASH=scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`);
console.log(`\nSESSION_SECRET=${randomBytes(32).toString('base64url')}  # only if you don't have one yet`);

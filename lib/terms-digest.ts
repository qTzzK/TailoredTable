import 'server-only';
import { createHash } from 'node:crypto';

// Short digest of the exact terms text a customer was shown. The invoice page
// renders it into the payment component, which echoes it back on checkout; the
// server recomputes it from the current DB row and refuses the payment if it
// has changed. It is only ever an equality gate — never a source of truth for
// any amount — so "the client never sends an amount" still holds.
export function termsDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32);
}

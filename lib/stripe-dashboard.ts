import 'server-only';

// Stripe's dashboard keeps test and live data in separate URL spaces, and a
// live URL opened against a test payment (or the reverse) shows "not found"
// rather than the charge you wanted to check. The mode is taken from the key
// this deployment actually transacts with, so staging links land in test data
// and production links land in live data without any extra configuration.

const LIVE_BASE = 'https://dashboard.stripe.com';
const TEST_BASE = 'https://dashboard.stripe.com/test';

export function stripeDashboardBase(): string {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  // Unset (local dev) falls to the test space deliberately: a dead test link is
  // harmless, a link into live payment data from a misconfigured env is not.
  const live = key.startsWith('sk_live_') || key.startsWith('rk_live_');
  return live ? LIVE_BASE : TEST_BASE;
}

import 'server-only';

// Required at runtime for the feature that uses them. Resend vars are
// intentionally optional — email degrades gracefully until it's configured.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  // Preview (staging) deployments generate links against their own stable
  // branch URL, never the production domain — so test invoices stay in the
  // test environment. VERCEL_BRANCH_URL survives redeploys of the branch;
  // VERCEL_URL (unique per deployment) is the fallback.
  if (process.env.VERCEL_ENV === 'preview') {
    if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

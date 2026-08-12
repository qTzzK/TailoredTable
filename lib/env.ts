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
  // On Vercel, fall back to the deployment's own URL so Stripe return URLs
  // and email links work before SITE_URL is configured.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

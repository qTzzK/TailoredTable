import 'server-only';
import { requireEnv } from './env';

// Thin typed wrapper over the Supabase PostgREST API, using the service-role
// key. Every table has RLS enabled with zero policies, so this is the only
// way data is read or written — nothing is reachable with the anon key.

function headers(): Record<string, string> {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function url(table: string, query?: string): string {
  return `${requireEnv('SUPABASE_URL')}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    throw new Error(`Supabase ${action} failed: ${res.status} ${await res.text()}`);
  }
}

export async function dbSelect<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(url(table, query), { headers: headers(), cache: 'no-store' });
  await assertOk(res, `select from ${table}`);
  return res.json();
}

export async function dbInsert<T>(table: string, row: unknown): Promise<T> {
  const res = await fetch(url(table), {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  await assertOk(res, `insert into ${table}`);
  const [inserted] = await res.json();
  return inserted;
}

// Returns the updated rows. An empty array means the filter matched nothing —
// callers use this for atomic compare-and-set (e.g. idempotent webhook settling).
export async function dbUpdate<T>(table: string, query: string, patch: unknown): Promise<T[]> {
  const res = await fetch(url(table, query), {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  await assertOk(res, `update ${table}`);
  return res.json();
}

export async function dbDelete(table: string, query: string): Promise<void> {
  const res = await fetch(url(table, query), { method: 'DELETE', headers: headers() });
  await assertOk(res, `delete from ${table}`);
}

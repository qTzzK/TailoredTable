'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace('/admin');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error || 'Invalid password.');
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setBusy(false);
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <span className="admin-login-name">Tailored Taste</span>
          <span className="admin-login-tag">Admin</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="admin-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

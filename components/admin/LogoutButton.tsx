'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={handleLogout}>
      Sign Out
    </button>
  );
}

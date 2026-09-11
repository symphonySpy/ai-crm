'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

export function TopBar({ user }: { user: User | null }) {
  const router = useRouter();

  async function signOut() {
    await api.logout().catch(() => undefined);
    router.replace('/login');
  }

  return (
    <header className="topbar">
      <Link href="/leads" className="brand" style={{ color: 'inherit' }}>
        AI CRM
      </Link>
      <span className="spacer" />
      {user && (
        <>
          <span className="who">
            {user.name} · {user.role}
          </span>
          <button className="btn-sm" onClick={signOut}>
            ออกจากระบบ
          </button>
        </>
      )}
    </header>
  );
}

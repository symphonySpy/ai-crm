'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/auth';

/**
 * The frame every signed-in screen sits in.
 *
 * tmk-admin keeps these under layouts/ (BaseLayout, AdminLayout, …) and it is a good
 * habit: before this existed, the header markup was copy-pasted into each page, which
 * is how two screens end up with different sign-out behaviour.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="shell">
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
      {children}
    </div>
  );
}

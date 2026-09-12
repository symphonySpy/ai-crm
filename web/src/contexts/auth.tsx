'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';
import { ApiError, authService } from '@/services';

/**
 * Who is signed in, asked once per page load instead of once per screen.
 *
 * Same idea as tmk-admin's contexts/auth.js, with one difference that matters: that one
 * reads localStorage to decide whether the user is authenticated, which means the
 * client is the one answering the question. Here the answer comes from the API — the
 * session cookie is httpOnly and unreadable from JavaScript, so /api/auth/me is the
 * only way to know, and it is also the only answer worth trusting.
 */
interface AuthValue {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authService
      .me()
      .then((d) => {
        if (!cancelled) setUser(d.user);
      })
      .catch((err) => {
        // A cookie that is present but no longer valid gets here. middleware.ts cannot
        // see that — it can only check the cookie exists — so this is where a stale
        // session is actually resolved.
        if (err instanceof ApiError && err.needsLogin) router.replace('/login');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    await authService.logout().catch(() => undefined);
    setUser(null);
    router.replace('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

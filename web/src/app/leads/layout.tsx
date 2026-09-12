import { AuthProvider } from '@/contexts/auth';
import { AppShell } from '@/layouts/AppShell';

/**
 * Wraps every screen under /leads. The provider sits here rather than in the root
 * layout so the login page does not ask "who am I?" — it already knows the answer is
 * nobody, and asking would cost a guaranteed 401 on every visit.
 */
export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}

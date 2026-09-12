'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, authService } from '@/services';

export default function LoginPage() {
  const router = useRouter();
  // Deliberately blank. Credentials for the demo accounts are sent separately and are
  // not in this repository — a prefilled address is the same disclosure as printing it.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authService.login(email, password);
      // middleware.ts puts the page they were trying to reach in ?next=, so a link to a
      // specific lead still lands on that lead after signing in. Read from the URL
      // rather than useSearchParams so this page needs no Suspense boundary.
      const next = new URLSearchParams(window.location.search).get('next');
      // Only a same-site path is accepted. Taking the value as given would turn this
      // into an open redirect: ?next=https://evil.example lands the user somewhere else
      // entirely, right after they typed their password.
      const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/leads';
      router.replace(safe);
    } catch (err) {
      // The API answers identically for an unknown address and a wrong password, so
      // there is nothing more specific to show here — and showing more would be the leak.
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 400, paddingTop: 72 }}>
      <div className="card stack">
        <div>
          <h1>AI CRM</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            ระบบสาธิต — ข้อมูลทั้งหมดเป็นข้อมูลสังเคราะห์
          </p>
        </div>

        <form className="stack" onSubmit={submit}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">อีเมล</span>
            <input
              type="email"
              value={email}
              autoComplete="username"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="stack" style={{ gap: 4 }}>
            <span className="small">รหัสผ่าน</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <p className="notice notice-error small" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </main>
  );
}

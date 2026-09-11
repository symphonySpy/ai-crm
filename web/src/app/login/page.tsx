'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('manager@demo.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      router.replace('/leads');
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

        <p className="muted small" style={{ margin: 0 }}>
          บัญชีสาธิต: <code>manager@demo.local</code> หรือ <code>sales@demo.local</code>
          <br />
          รหัสผ่านอยู่ใน README
        </p>
      </div>
    </main>
  );
}

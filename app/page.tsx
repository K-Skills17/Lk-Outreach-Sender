'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';

type Me = { id: string; role: string; email: string; name: string | null };

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setMe(null);
        else setMe(d);
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="loading">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="page-header">
          <h1>LK Outreach Sender</h1>
          {me && (
            <div className="user-bar">
              <span className="email">{me.email}</span>
              <span className="role">{me.role}</span>
              <button type="button" className="btn btn-secondary" onClick={logout}>
                Log out
              </button>
            </div>
          )}
        </div>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Upload CSV, manage templates, queue WhatsApp messages. The Python sender runs centrally with your service token and processes all SDR queues on autopilot.
        </p>
        {me?.role === 'admin' && (
          <div className="nav-grid">
            <Link href="/upload" className="nav-link">Upload CSV</Link>
            <Link href="/templates" className="nav-link">Templates</Link>
            <Link href="/send" className="nav-link">Queue send</Link>
            <Link href="/sellers" className="nav-link">SDRs</Link>
          </div>
        )}
        {me?.role === 'sdr' && (
          <div className="nav-grid">
            <Link href="/me" className="nav-link">My account</Link>
          </div>
        )}
        {!me && (
          <div className="card">
            <p style={{ margin: 0 }}>
              <Link href="/login" className="btn btn-primary" style={{ marginRight: '0.5rem' }}>Log in</Link>
              or <Link href="/setup">Create admin account</Link>
            </p>
          </div>
        )}
        <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          API: <code>GET /api/health</code>, <code>GET /api/sender/queue</code> (with service token), etc.
        </p>
      </main>
    </div>
  );
}

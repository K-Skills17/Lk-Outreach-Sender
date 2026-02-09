'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Me = { id: string; role: string; email: string; name: string | null };

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setMe(d);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="loading">Loading…</p>
        </main>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="loading">Not logged in.</p>
          <Link href="/login" className="btn btn-primary" style={{ marginTop: '1rem' }}>Log in</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="breadcrumb">
          <Link href="/">← Home</Link>
        </div>
        <div className="page-header">
          <h1>My account</h1>
        </div>
        <div className="card">
          <div style={{ marginBottom: '0.75rem' }}>
            <strong>Email:</strong> {me.email}
          </div>
          {me.name && (
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Name:</strong> {me.name}
            </div>
          )}
          <div>
            <strong>Role:</strong> <span className="role">{me.role}</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Messages assigned to you are sent automatically by the centralized sender. No setup needed on your end.
          </p>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Me = { id: string; role: string; email: string; name: string | null; sender_token: string | null };

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setMe(d);
      })
      .finally(() => setLoading(false));
  }, []);

  function copyToken() {
    if (!me?.sender_token) return;
    navigator.clipboard.writeText(me.sender_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <h1>My sender token</h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Use this token in the Python sender app so only your assigned messages are sent from your WhatsApp.
        </p>
        {me.sender_token ? (
          <div className="card">
            <label className="card-title">Token (keep secret)</label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <code style={{ flex: '1', minWidth: 0, wordBreak: 'break-all', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                {me.sender_token}
              </code>
              <button type="button" className="btn btn-primary" onClick={copyToken}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <div className="alert alert-error">
            No token yet. Ask an admin to regenerate your sender token.
          </div>
        )}
        <div className="card" style={{ marginTop: '1rem' }}>
          <p className="card-title">Python sender setup</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            In <code>python-sender/.env</code> set:
          </p>
          <pre>{`API_BASE_URL=${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}
SENDER_SERVICE_TOKEN=<your token above>`}</pre>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Run <code>python send_whatsapp.py</code>. Only messages assigned to you will appear in the queue.
          </p>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseBrowser';

export default function SetupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        setSetupNeeded(data.setupNeeded === true);
        if (data.error && !data.setupNeeded) {
          setCheckError(data.error);
        } else {
          setCheckError(null);
        }
      })
      .catch((err) => {
        setCheckError(err instanceof Error ? err.message : 'Network error');
        setSetupNeeded(false);
      })
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!checking && !setupNeeded && !checkError) router.replace('/login');
  }, [checking, setupNeeded, checkError, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      let data: { error?: string; details?: string } = {};
      try {
        data = await res.json();
      } catch {
        setError(res.ok ? 'Invalid response' : `Setup failed (${res.status}). Check server logs.`);
        return;
      }
      if (!res.ok) {
        const msg = data.error ?? data.details ?? `Setup failed (${res.status})`;
        setError(msg);
        return;
      }
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setError('Account created. Please sign in on the login page.');
        setTimeout(() => router.replace('/login'), 2000);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="loading">Checking setup…</p>
        </div>
      </div>
    );
  }
  if (checkError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Setup check failed</h1>
          <p className="sub">{checkError}</p>
          <p className="sub" style={{ marginTop: '0.5rem' }}>
            Run migrations 001–004 in Supabase (SQL Editor). Use <strong>SUPABASE_SERVICE_ROLE_KEY</strong> (service_role, not anon) in .env.local.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => { setChecking(true); setCheckError(null); }} style={{ marginTop: '1rem' }}>
            Retry
          </button>
          <p style={{ marginTop: '1.5rem' }}>
            <Link href="/login">Back to login</Link>
          </p>
        </div>
      </div>
    );
  }
  if (!setupNeeded) return null;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create admin account</h1>
        <p className="sub">No users yet. Create the first account (admin). You’ll be signed in after.</p>
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="At least 6 characters"
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Creating…' : 'Create admin'}
          </button>
        </form>
        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          <Link href="/login">← Back to login</Link>
        </p>
      </div>
    </div>
  );
}

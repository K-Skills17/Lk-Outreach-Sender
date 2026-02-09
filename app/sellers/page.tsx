'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Seller = { id: string; email: string; name: string | null; role: string; created_at: string };

export default function SellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{ sellerId: string; token: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [regenId, setRegenId] = useState<string | null>(null);
  const [regenToken, setRegenToken] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/sellers');
    const data = await res.json();
    if (res.ok) setSellers(data.sellers ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim() || !addPassword) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), name: addName.trim() || undefined, password: addPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? 'Failed');
        return;
      }
      setShowAdd(false);
      setAddEmail('');
      setAddName('');
      setAddPassword('');
      setNewToken({ sellerId: data.id, token: data.sender_token });
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setAdding(false);
    }
  }

  async function handleResetPassword(sellerId: string) {
    if (!newPassword || newPassword.length < 6) return;
    setResettingId(sellerId);
    try {
      const res = await fetch(`/api/sellers/${sellerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        setNewPassword('');
        setResettingId(null);
      }
    } finally {
      setResettingId(null);
    }
  }

  async function handleRegenerateToken(sellerId: string) {
    setRegenId(sellerId);
    try {
      const res = await fetch(`/api/sellers/${sellerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateToken: true }),
      });
      const data = await res.json();
      if (res.ok && data.sender_token) {
        setRegenToken(data.sender_token);
        setRegenId(null);
      }
    } finally {
      setRegenId(null);
    }
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="breadcrumb">
          <Link href="/">← Home</Link>
        </div>
        <div className="page-header">
          <h1>SDRs</h1>
          <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : 'Add SDR'}
          </button>
        </div>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Add SDRs (sellers). Each gets a sender token for the Python app. Reset password or regenerate token as needed.
        </p>
        {showAdd && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Name (optional)</label>
                <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} required minLength={6} />
              </div>
              {addError && <div className="alert alert-error">{addError}</div>}
              <button type="submit" className="btn btn-primary" disabled={adding}>
                {adding ? 'Adding…' : 'Add SDR'}
              </button>
            </form>
          </div>
        )}
        {newToken && (
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            <strong>New SDR token (give this to the SDR once):</strong>
            <pre style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>{newToken.token}</pre>
            <button type="button" className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => setNewToken(null)}>Dismiss</button>
          </div>
        )}
        {regenToken && (
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            <strong>New token (give to SDR to update their .env):</strong>
            <pre style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>{regenToken}</pre>
            <button type="button" className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => setRegenToken(null)}>Dismiss</button>
          </div>
        )}
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.75rem' }}>All users</h2>
        {loading && <p className="loading">Loading…</p>}
        {!loading && sellers.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No sellers yet.</p>}
        {!loading && sellers.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.email}</td>
                    <td>{s.name ?? '—'}</td>
                    <td><span className="role">{s.role}</span></td>
                    <td>
                      {s.role === 'sdr' && (
                        <>
                          {resettingId === s.id ? (
                            <span style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} style={{ width: 140 }} />
                              <button type="button" className="btn btn-primary" onClick={() => handleResetPassword(s.id)}>Save</button>
                              <button type="button" className="btn btn-ghost" onClick={() => setResettingId(null)}>Cancel</button>
                            </span>
                          ) : (
                            <>
                              <button type="button" className="btn btn-ghost" style={{ marginRight: '0.5rem' }} onClick={() => setResettingId(s.id)}>Reset password</button>
                              <button type="button" className="btn btn-secondary" onClick={() => handleRegenerateToken(s.id)} disabled={regenId !== null}>
                                {regenId === s.id ? '…' : 'Regenerate token'}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

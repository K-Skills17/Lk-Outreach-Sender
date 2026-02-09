'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type Seller = { id: string; email: string; name: string | null; role: string; created_at: string };
type BatchResult = { email: string; name: string | null; success: boolean; sender_token?: string; error?: string };

function parseCSV(text: string): { email: string; name?: string; password: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const emailIdx = header.indexOf('email');
  const nameIdx = header.indexOf('name');
  const passwordIdx = header.indexOf('password');

  if (emailIdx === -1 || passwordIdx === -1) return [];

  const results: { email: string; name?: string; password: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const email = cols[emailIdx];
    const password = cols[passwordIdx];
    if (!email || !password) continue;
    const entry: { email: string; name?: string; password: string } = { email, password };
    if (nameIdx !== -1 && cols[nameIdx]) entry.name = cols[nameIdx];
    results.push(entry);
  }
  return results;
}

function downloadCSVTemplate() {
  const template = 'email,name,password\njohn@example.com,John Smith,securepass123\njane@example.com,Jane Doe,anotherpass456\n';
  const blob = new Blob([template], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sdr_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

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

  // Service token state
  const [hasServiceToken, setHasServiceToken] = useState(false);
  const [serviceToken, setServiceToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  // Batch upload state
  const [showBatch, setShowBatch] = useState(false);
  const [batchParsed, setBatchParsed] = useState<{ email: string; name?: string; password: string }[]>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch('/api/sellers');
    const data = await res.json();
    if (res.ok) setSellers(data.sellers ?? []);
    setLoading(false);
  }

  async function loadServiceToken() {
    const res = await fetch('/api/sellers/service-token');
    const data = await res.json();
    if (res.ok) setHasServiceToken(data.has_token);
  }

  async function handleGenerateServiceToken() {
    setGeneratingToken(true);
    try {
      const res = await fetch('/api/sellers/service-token', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setServiceToken(data.sender_token);
        setHasServiceToken(true);
      }
    } finally {
      setGeneratingToken(false);
    }
  }

  useEffect(() => {
    load();
    loadServiceToken();
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setBatchError('Could not parse CSV. Make sure it has "email" and "password" columns with a header row.');
        return;
      }
      setBatchError(null);
      setBatchParsed(parsed);
    };
    reader.readAsText(file);
  }

  async function handleBatchCreate() {
    if (batchParsed.length === 0) return;
    setBatchUploading(true);
    setBatchError(null);
    setBatchResults(null);
    try {
      const res = await fetch('/api/sellers/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdrs: batchParsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBatchError(data.error ?? 'Failed to create SDRs');
        return;
      }
      setBatchResults(data.results);
      setBatchParsed([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBatchUploading(false);
    }
  }

  function exportBatchResults() {
    if (!batchResults) return;
    const header = 'email,name,status,sender_token,error';
    const rows = batchResults.map((r) =>
      [r.email, r.name ?? '', r.success ? 'created' : 'failed', r.sender_token ?? '', r.error ?? ''].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sdr_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="breadcrumb">
          <Link href="/">← Home</Link>
        </div>
        <div className="page-header">
          <h1>SDRs</h1>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowBatch(!showBatch); setShowAdd(false); }}>
              {showBatch ? 'Cancel' : 'Batch Upload'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowAdd(!showAdd); setShowBatch(false); }}>
              {showAdd ? 'Cancel' : 'Add SDR'}
            </button>
          </span>
        </div>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Create SDRs for assignment tracking. The Python sender runs centrally using your service token -- SDRs don&apos;t need to install or configure anything.
        </p>

        {/* Service Token Section */}
        <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid var(--color-border)' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Centralized Sender (Service Token)</h3>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
            Use this token in the Python sender to process messages for <strong>all SDRs</strong> from one machine.
            SDRs are created just for assignment tracking -- they don&apos;t need to run anything.
          </p>
          {serviceToken && (
            <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
              <strong>Service token (save this -- shown only once):</strong>
              <pre style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>{serviceToken}</pre>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                In <code>python-sender/.env</code> set:<br />
                <code>SENDER_SERVICE_TOKEN={serviceToken}</code>
              </p>
              <button type="button" className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => setServiceToken(null)}>Dismiss</button>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerateServiceToken}
            disabled={generatingToken}
          >
            {generatingToken ? 'Generating…' : hasServiceToken ? 'Regenerate service token' : 'Generate service token'}
          </button>
          {hasServiceToken && !serviceToken && (
            <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Service token is active. Regenerate only if you need a new one.
            </span>
          )}
        </div>

        {/* Batch Upload Section */}
        {showBatch && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Batch Create SDRs from CSV</h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
              Upload a CSV file with columns: <strong>email</strong>, <strong>name</strong> (optional), <strong>password</strong>.
              Up to 100 SDRs per batch.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={downloadCSVTemplate}>
                Download CSV template
              </button>
            </div>
            <div className="form-group">
              <label>Select CSV file</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
              />
            </div>
            {batchError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{batchError}</div>}
            {batchParsed.length > 0 && (
              <>
                <p style={{ marginBottom: '0.75rem' }}>
                  <strong>{batchParsed.length}</strong> SDR{batchParsed.length !== 1 ? 's' : ''} found in CSV:
                </p>
                <div className="table-wrap" style={{ marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchParsed.map((s, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{s.email}</td>
                          <td>{s.name ?? '—'}</td>
                          <td>{'•'.repeat(Math.min(s.password.length, 12))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBatchCreate}
                  disabled={batchUploading}
                >
                  {batchUploading ? 'Creating SDRs…' : `Create ${batchParsed.length} SDR${batchParsed.length !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        )}

        {/* Batch Results */}
        {batchResults && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3>
                Batch Results: {batchResults.filter((r) => r.success).length} created, {batchResults.filter((r) => !r.success).length} failed
              </h3>
              <span style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={exportBatchResults}>
                  Export results CSV
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setBatchResults(null)}>
                  Dismiss
                </button>
              </span>
            </div>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
              Download the results CSV to save sender tokens. Tokens are shown only once.
            </p>
            <div className="table-wrap" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Sender Token</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResults.map((r, i) => (
                    <tr key={i}>
                      <td>{r.email}</td>
                      <td>{r.name ?? '—'}</td>
                      <td>
                        <span style={{ color: r.success ? 'var(--color-success, green)' : 'var(--color-error, red)' }}>
                          {r.success ? 'Created' : r.error ?? 'Failed'}
                        </span>
                      </td>
                      <td>
                        {r.sender_token ? (
                          <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{r.sender_token}</code>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

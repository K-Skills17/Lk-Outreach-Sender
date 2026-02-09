'use client';

import { useState } from 'react';
import Link from 'next/link';

type Result = {
  leads: { id: string }[];
  errors: { row: number; message: string }[];
  created?: number;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const res = await fetch('/api/csv/process', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Upload failed');
        return;
      }
      setResult({ leads: data.leads ?? [], errors: data.errors ?? [], created: data.created });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="breadcrumb">
          <Link href="/">← Home</Link>
        </div>
        <div className="page-header">
          <h1>Upload CSV</h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          CSV must have a header row. Include a phone column (phone, telefone, or whatsapp). Name and company columns optional (nome, empresa).
        </p>
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Choose CSV file</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!file || loading}>
              {loading ? 'Processing…' : 'Process CSV'}
            </button>
          </form>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {result && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p className="card-title">Processed: {result.leads.length} lead(s) created/updated.</p>
            {result.errors.length > 0 && (
              <>
                <p style={{ color: 'var(--color-error)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Row errors: {result.errors.length}</p>
                <ul style={{ fontSize: '0.9rem', marginTop: '0.5rem', paddingLeft: '1.25rem', color: 'var(--color-text-muted)' }}>
                  {result.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>Row {err.row}: {err.message}</li>
                  ))}
                  {result.errors.length > 10 && <li>… and {result.errors.length - 10} more</li>}
                </ul>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

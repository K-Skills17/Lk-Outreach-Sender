'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Lead = { id: string; contact_name: string | null; contact_phone: string | null; business_name: string | null; last_contacted_at: string | null };
type Template = { id: string; name: string; body: string };
type Seller = { id: string; email: string; name: string | null; role: string };

export default function SendPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'template' | 'ai'>('template');
  const [templateId, setTemplateId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ queued: number; errors: { leadId: string; message: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sdrs = sellers.filter((s) => s.role === 'sdr');

  useEffect(() => {
    Promise.all([
      fetch('/api/leads').then((r) => r.json()),
      fetch('/api/templates').then((r) => r.json()),
      fetch('/api/sellers').then((r) => r.json()),
    ]).then(([leadsData, templatesData, sellersData]) => {
      setLeads(leadsData.leads ?? []);
      setTemplates(templatesData.templates ?? []);
      setSellers(sellersData.sellers ?? []);
      if ((templatesData.templates ?? []).length > 0) setTemplateId(templatesData.templates[0].id);
      const sdrList = (sellersData.sellers ?? []).filter((s: Seller) => s.role === 'sdr');
      if (sdrList.length > 0) setAssignedTo(sdrList[0].id);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  function toggleLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(leads.map((l) => l.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setError('Select at least one lead.');
      return;
    }
    if (mode === 'template' && !templateId) {
      setError('Select a template.');
      return;
    }
    if (!assignedTo) {
      setError('Select an SDR to assign the messages to.');
      return;
    }
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/send/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: ids,
          mode,
          templateId: mode === 'template' ? templateId : undefined,
          instructions: mode === 'ai' && instructions.trim() ? instructions.trim() : undefined,
          assignedTo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Queue failed');
        return;
      }
      setResult({ queued: data.queued ?? 0, errors: data.errors ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="breadcrumb">
          <Link href="/">← Home</Link>
        </div>
        <div className="page-header">
          <h1>Queue send</h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Select leads, choose template or AI with instructions, then queue. The Python sender will pick them up.
        </p>
        {loading && <p className="loading">Loading leads and templates…</p>}
        {!loading && (
          <div className="card">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Assign to SDR</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  {sdrs.length === 0 && <option value="">— No SDRs —</option>}
                  {sdrs.map((s) => (
                    <option key={s.id} value={s.id}>{s.name || s.email}</option>
                  ))}
                </select>
                {sdrs.length === 0 && <p style={{ marginTop: '0.5rem', color: 'var(--color-error)', fontSize: '0.9rem' }}>Add SDRs on the SDRs page first.</p>}
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Mode</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                    <input type="radio" checked={mode === 'template'} onChange={() => setMode('template')} />
                    Template
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                    <input type="radio" checked={mode === 'ai'} onChange={() => setMode('ai')} />
                    AI (instructions)
                  </label>
                </div>
              </div>
              {mode === 'template' && (
                <div className="form-group">
                  <label>Template</label>
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {mode === 'ai' && (
                <div className="form-group">
                  <label>Instructions (optional)</label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. Focus on scheduling a call; mention our free audit."
                    rows={3}
                  />
                </div>
              )}
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={selectAll}>Select all</button>
                <button type="button" className="btn btn-ghost" onClick={selectNone}>Select none</button>
              </div>
              <div className="form-group">
                <label>Leads</label>
                <div className="checkbox-list">
                  {leads.length === 0 && <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>No leads. Upload a CSV first.</p>}
                  {leads.map((l) => (
                    <label key={l.id}>
                      <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleLead(l.id)} />
                      {l.contact_name ?? '—'} | {l.contact_phone ?? '—'} {l.last_contacted_at ? '(contacted)' : ''}
                    </label>
                  ))}
                </div>
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Queuing…' : 'Queue send'}
              </button>
            </form>
          </div>
        )}
        {result && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p className="card-title">Queued: {result.queued} message(s).</p>
            {result.errors.length > 0 && (
              <ul style={{ fontSize: '0.9rem', color: 'var(--color-error)', marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e.leadId}: {e.message}</li>
                ))}
                {result.errors.length > 5 && <li>… and {result.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

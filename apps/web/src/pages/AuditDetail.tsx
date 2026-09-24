import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';

interface AuditItemRow {
  id: string;
  auditId: string;
  productId: string;
  productName: string;
  subcategory: string;
  availQty: number;
  availableQty: number;
  matchedQty: number;
  mrp: number;
  ctc: number;
  matchedBy: string | null;
  matchedAt: string | null;
  matchedDate: string | null;
}

interface AuditData {
  id: string;
  storeId: string;
  category: string;
  subcategory: string;
  startedAt: string;
  endedAt: string | null;
  initiatedBy: string;
  items: AuditItemRow[];
}

function fmtRs(n: number) {
  return `Rs.${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-IN');
}

function productImageUrl(productId: string) {
  return `https://www.firstcry.com/assetsv2/imgs/products/medium/${productId}-1.jpg`;
}

export default function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('new') === '1';

  const { data: audit, loading, error, refetch } = useFetch<AuditData>(`/audits/${id}`);

  const [fcInput, setFcInput]     = useState('');
  const [mrpInput, setMrpInput]   = useState('');
  const [scanning, setScanning]   = useState(false);
  const [closing, setClosing]     = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(
    isNew ? { text: 'New Audit Started Successfully', ok: true } : null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on load
  useEffect(() => { inputRef.current?.focus(); }, [loading]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const fc = fcInput.trim();
    if (!fc || !id) return;
    setScanning(true);
    try {
      const res = await api.post(`/audits/${id}/scan`, { fcId: fc });
      const item: AuditItemRow = res.data.data;
      setFlash({ text: `✓ Matched: ${item.productName} (${item.matchedQty}/${item.availQty} units)`, ok: true });
      setFcInput('');
      setMrpInput('');
      refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Scan failed';
      setFlash({ text: `✗ ${msg}`, ok: false });
    } finally {
      setScanning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function closeAudit() {
    if (!confirm('End this audit? This cannot be undone.')) return;
    setClosing(true);
    try {
      await api.patch(`/audits/${id}/close`);
      refetch();
    } catch (err: any) {
      setFlash({ text: `✗ ${err?.response?.data?.message ?? 'Close failed'}`, ok: false });
    } finally { setClosing(false); }
  }

  if (loading) return <div className="loading">Loading audit…</div>;
  if (error)   return <div className="error-box">{error}</div>;
  if (!audit)  return null;

  const items = audit.items ?? [];
  const isClosed = !!audit.endedAt;

  // ── Compute per-subcategory summaries ─────────────────────────────────────
  const subMap = new Map<string, {
    totalQty: number; totalMrp: number; totalCtc: number;
    matchedQty: number; matchedMrp: number; matchedCtc: number;
    items: AuditItemRow[];
  }>();

  for (const item of items) {
    const sub = item.subcategory || '(No Subcategory)';
    if (!subMap.has(sub)) subMap.set(sub, { totalQty: 0, totalMrp: 0, totalCtc: 0, matchedQty: 0, matchedMrp: 0, matchedCtc: 0, items: [] });
    const s = subMap.get(sub)!;
    const avail = item.availQty ?? item.availableQty ?? 0;
    const matched = item.matchedQty ?? 0;
    s.totalQty   += avail;
    s.totalMrp   += avail * item.mrp;
    s.totalCtc   += avail * item.ctc;
    s.matchedQty += matched;
    s.matchedMrp += matched * item.mrp;
    s.matchedCtc += matched * item.ctc;
    s.items.push(item);
  }

  const grandTotalQty    = items.reduce((s, i) => s + (i.availQty ?? 0), 0);
  const grandMatchedQty  = items.reduce((s, i) => s + (i.matchedQty ?? 0), 0);
  const grandTotalMrp    = items.reduce((s, i) => s + (i.availQty ?? 0) * i.mrp, 0);
  const grandMatchedMrp  = items.reduce((s, i) => s + (i.matchedQty ?? 0) * i.mrp, 0);

  return (
    <>
      {/* ── Flash banner ── */}
      {flash && (
        <div style={{
          margin: '0 0 12px',
          padding: '14px 20px',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 14,
          textAlign: 'center',
          background: flash.ok ? '#c8133a' : 'rgba(239,68,68,0.12)',
          color: flash.ok ? '#fff' : 'var(--red)',
          border: flash.ok ? 'none' : '1px solid rgba(239,68,68,0.3)',
        }}>
          {flash.text}
          <button onClick={() => setFlash(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* ── View Audits link ── */}
      <div style={{ marginBottom: 10 }}>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00c', textDecoration: 'underline', fontSize: 14, padding: 0 }}
          onClick={() => navigate('/audits')}
        >
          View Audits
        </button>
      </div>

      {/* ── Scan form (only when audit is open) ── */}
      {!isClosed && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 14, textAlign: 'center' }}>Stock Audit</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', marginBottom: 14, fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>Category</span>
            <span>{audit.category}</span>
            <span style={{ fontWeight: 600 }}>Sub-Category</span>
            <span>{audit.subcategory || '--'}</span>
          </div>

          <form onSubmit={handleScan}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>FC Id / Product Bar Code</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={fcInput}
                  onChange={e => setFcInput(e.target.value)}
                  placeholder="Scan or type FC ID…"
                  autoComplete="off"
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 5,
                    border: '1px solid var(--border)', background: 'var(--bg1)',
                    color: 'var(--text1)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  MRP <span style={{ fontWeight: 400, color: 'var(--text2)' }}>(required only if item have multiple MRP in same load)</span>
                </label>
                <input
                  type="text"
                  value={mrpInput}
                  onChange={e => setMrpInput(e.target.value)}
                  placeholder="Optional"
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 14, borderRadius: 5,
                    border: '1px solid var(--border)', background: 'var(--bg1)',
                    color: 'var(--text1)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={scanning || !fcInput.trim()}
                className="btn btn-brand"
                style={{ padding: '8px 28px', fontSize: 14 }}
              >
                {scanning ? '…' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Summary table (per subcategory) ── */}
      {subMap.size > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category &gt; Sub-Category</th>
                  <th>Start / End Date</th>
                  <th style={{ textAlign: 'center' }}>Total Qty</th>
                  <th>MRP / CTC</th>
                  <th style={{ textAlign: 'center' }}>Matched Qty</th>
                  <th>Matched MRP / CTC</th>
                  <th>Initiated By</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(subMap.entries()).map(([sub, s]) => (
                  <tr key={sub}>
                    <td style={{ fontWeight: 600 }}>{audit.category} &gt; {sub}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(audit.startedAt)} / {fmtDate(audit.endedAt)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.totalQty}</td>
                    <td style={{ fontSize: 12 }}>
                      {fmtRs(s.totalMrp)}<br />
                      <span style={{ color: 'var(--text2)' }}>{fmtRs(s.totalCtc)}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: s.matchedQty === s.totalQty ? 'var(--green)' : 'var(--amber)' }}>
                      {s.matchedQty}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {fmtRs(s.matchedMrp)}<br />
                      <span style={{ color: 'var(--text2)' }}>{fmtRs(s.matchedCtc)}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{audit.initiatedBy}</td>
                  </tr>
                ))}
                {/* Grand total row */}
                <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                  <td>Grand Total</td>
                  <td></td>
                  <td style={{ textAlign: 'center' }}>{grandTotalQty}</td>
                  <td style={{ fontSize: 12 }}>{fmtRs(grandTotalMrp)}</td>
                  <td style={{ textAlign: 'center', color: grandMatchedQty === grandTotalQty ? 'var(--green)' : 'var(--amber)' }}>
                    {grandMatchedQty}
                  </td>
                  <td style={{ fontSize: 12 }}>{fmtRs(grandMatchedMrp)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Per-unit product detail table ── */}
      {items.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}></th>
                  <th>FC Id</th>
                  <th>Product Name</th>
                  <th style={{ textAlign: 'center' }}>Available / Matched Qty</th>
                  <th>MRP / Cost</th>
                  <th>Matched By / Date</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.flatMap((item) => {
                  const avail   = item.availQty ?? item.availableQty ?? 0;
                  const matched = item.matchedQty ?? 0;
                  const short   = avail - matched;
                  // Expand into one row per unit
                  const rows: React.ReactNode[] = [];

                  // Matched units
                  for (let u = 0; u < matched; u++) {
                    rows.push(
                      <tr key={`${item.id}-m${u}`} style={{ background: 'rgba(16,185,129,0.04)' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <img src={productImageUrl(item.productId)} alt="" style={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 4, display: 'block', background: '#f5f5f5' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{item.productId}</td>
                        <td style={{ fontSize: 13, fontWeight: 500 }}>{item.productName}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>1 / 1</td>
                        <td style={{ fontSize: 12 }}>{fmtRs(item.mrp)} / {fmtRs(item.ctc)}</td>
                        <td style={{ fontSize: 11, color: 'var(--text2)' }}>{item.matchedBy ?? 'N/a'}{item.matchedAt ? ` / ${fmtDate(item.matchedAt)}` : ''}</td>
                        <td style={{ textAlign: 'center' }}><span className="chip chip-green">Matched ✓</span></td>
                      </tr>
                    );
                  }

                  // Short units
                  for (let u = 0; u < short; u++) {
                    rows.push(
                      <tr key={`${item.id}-s${u}`} style={{ background: 'rgba(239,68,68,0.03)' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <img src={productImageUrl(item.productId)} alt="" style={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 4, display: 'block', background: '#f5f5f5' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{item.productId}</td>
                        <td style={{ fontSize: 13, fontWeight: 500 }}>{item.productName}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>1 / 0</td>
                        <td style={{ fontSize: 12 }}>{fmtRs(item.mrp)} / {fmtRs(item.ctc)}</td>
                        <td style={{ fontSize: 11, color: 'var(--text2)' }}>N/a</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: '#c8133a', fontWeight: 600, fontSize: 12 }}>1 Qty Short</span>
                        </td>
                      </tr>
                    );
                  }

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
          No products loaded in this audit. The catalog for "{audit.category}" may be empty — upload the stock CSV first.
        </div>
      )}

      {/* ── Bottom controls ── */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingBottom: 24 }}>
        {!isClosed && (
          <button className="btn btn-ghost" style={{ color: 'var(--red)' }} disabled={closing} onClick={closeAudit}>
            {closing ? 'Ending…' : 'End Audit'}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => navigate('/catalog')}>View Catalog</button>
      </div>
    </>
  );
}

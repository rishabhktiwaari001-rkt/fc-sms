import React, { useRef, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';

interface EossItem {
  id: string;
  storeId: string;
  fcId: string;
  productName: string;
  mrp: number;
  ctc: number;
  brand: string | null;
  category: string;
  subcategory: string;
  offer: string | null;
  couponCode: string | null;
  matchedStatus: 'pending' | 'matched' | 'not_found';
  matchedBy: string | null;
  matchedAt: string | null;
  isActive: number;
}

interface Stats { total: number; matched: number; notFound: number; pending: number; }

function productImageUrl(productId: string) {
  return `https://www.firstcry.com/assetsv2/imgs/products/medium/${productId}-1.jpg`;
}

export default function EOSS() {
  const [tick, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);

  const { data: items, loading, error, refetch } = useFetch<EossItem[]>('/eoss', { _tick: tick });
  const { data: stats, refetch: refetchStats } = useFetch<Stats>('/eoss/stats', { _tick: tick });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'matched' | 'not_found'>('all');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Scan FC ID input (for marking items directly from search)
  const [scanInput, setScanInput] = useState('');
  const [scanning, setScanning]   = useState(false);
  const [scanFlash, setScanFlash] = useState<{ text: string; ok: boolean; item?: EossItem } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allItems = items ?? [];

  const filtered = allItems.filter(i => {
    const matchSearch = !search
      || i.fcId.includes(search)
      || i.productName.toLowerCase().includes(search.toLowerCase())
      || (i.brand ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || i.matchedStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/eoss/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = res.data.data;
      setUploadMsg({ text: `✓ Imported ${d.inserted} products (${d.skipped} skipped)`, ok: true });
      bump();
    } catch (err: any) {
      setUploadMsg({ text: `✗ ${err?.response?.data?.error ?? 'Upload failed'}`, ok: false });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const fc = scanInput.trim();
    if (!fc) return;
    setScanning(true);
    try {
      const res = await api.post('/eoss/scan', { fcId: fc });
      const item: EossItem = res.data.data;

      // Auto-mark as matched immediately on scan
      await api.patch(`/eoss/${item.id}/status`, { status: 'matched' });

      setScanFlash({
        text: `✓ Matched: ${item.productName}${item.offer ? ` — Offer: ${item.offer}` : ''}`,
        ok: true,
        item: { ...item, matchedStatus: 'matched' },
      });
      setScanInput('');
      bump();
    } catch (err: any) {
      setScanFlash({ text: `✗ ${err?.response?.data?.error ?? 'Not found'}`, ok: false });
    } finally {
      setScanning(false);
      setTimeout(() => scanRef.current?.focus(), 50);
    }
  }

  async function setStatus(itemId: string, status: 'matched' | 'not_found') {
    try {
      await api.patch(`/eoss/${itemId}/status`, { status });
      setScanFlash(null);
      bump();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Failed');
    }
  }

  const s = stats ?? { total: 0, matched: 0, notFound: 0, pending: 0 };

  return (
    <>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">EOSS Products</div>
          <div className="page-sub">End of Season Sale — scan and match products</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-brand"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Uploading…' : '↑ Upload EOSS Sheet'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* ── Upload message ── */}
      {uploadMsg && (
        <div style={{
          padding: '12px 16px', borderRadius: 6, marginBottom: 12, fontSize: 14, fontWeight: 600,
          background: uploadMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: uploadMsg.ok ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${uploadMsg.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {uploadMsg.text}
          <button onClick={() => setUploadMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* ── Stats bar ── */}
      {s.total > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          {([
            { label: 'Total Items', val: s.total, filter: 'all', color: 'var(--text1)' },
            { label: 'Total Matched', val: s.matched, filter: 'matched', color: 'var(--green)' },
            { label: 'Total Pending', val: s.pending, filter: 'pending', color: 'var(--amber)' },
            { label: 'Total Not Found', val: s.notFound, filter: 'not_found', color: 'var(--red)' },
          ] as const).map(({ label, val, filter, color }) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(statusFilter === filter ? 'all' : filter as any)}
              style={{
                padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border)',
                background: statusFilter === filter ? 'var(--brand)' : 'var(--bg1)',
                color: statusFilter === filter ? '#fff' : color,
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}
            >
              {label}: {val}
            </button>
          ))}
        </div>
      )}

      {/* ── Scan bar ── */}
      {allItems.length > 0 && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
          <form onSubmit={handleScan} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>Search Product in EOSS:</label>
            <input
              ref={scanRef}
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              placeholder="Enter FC Id to search"
              autoComplete="off"
              style={{
                flex: 1, padding: '7px 10px', fontSize: 14, borderRadius: 5,
                border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text1)', outline: 'none',
              }}
            />
            <button type="submit" className="btn btn-brand btn-sm" disabled={scanning || !scanInput.trim()}>
              {scanning ? '…' : 'Search Product'}
            </button>
          </form>
          {scanFlash && (
            <div style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 5, fontSize: 13, fontWeight: 500,
              background: scanFlash.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              color: scanFlash.ok ? 'var(--green)' : 'var(--red)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ flex: 1 }}>{scanFlash.text}</span>
              {scanFlash.item && scanFlash.item.matchedStatus === 'pending' && (
                <>
                  <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', border: 'none', fontSize: 12 }}
                    onClick={() => setStatus(scanFlash.item!.id, 'matched')}>Mark as Matched</button>
                  <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', border: 'none', fontSize: 12 }}
                    onClick={() => setStatus(scanFlash.item!.id, 'not_found')}>Mark as Not Found</button>
                </>
              )}
              {scanFlash.item && scanFlash.item.matchedStatus !== 'pending' && (
                <span className={`chip chip-${scanFlash.item.matchedStatus === 'matched' ? 'green' : 'red'}`}>
                  {scanFlash.item.matchedStatus === 'matched' ? 'Matched ✓' : 'Not Found'}
                </span>
              )}
              <button onClick={() => setScanFlash(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}>✕</button>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
            Note: While searching for an FC ID, if a product is neither "Matched" nor marked as "Not Found", the system will show it as pending.
          </div>
        </div>
      )}

      {/* ── Search / filter bar ── */}
      {allItems.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="inp"
            style={{ flex: 1, maxWidth: 320 }}
            placeholder="Filter by FC ID, product name, brand…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>Clear</button>
          )}
        </div>
      )}

      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-box">{error}</div>}

      {/* ── Empty state ── */}
      {!loading && allItems.length === 0 && (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>No EOSS items loaded</div>
          <div style={{ fontSize: 14 }}>Upload the EOSS Excel sheet to get started. The file should have columns: Product Id, Offer, Coupon code.</div>
        </div>
      )}

      {/* ── Product table ── */}
      {filtered.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 70 }}></th>
                  <th>FC Id</th>
                  <th>Product Detail</th>
                  <th>MRP / CTC</th>
                  <th style={{ textAlign: 'center' }}>Offer</th>
                  <th style={{ textAlign: 'center' }}>Matched Status?</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td style={{ padding: '6px 10px' }}>
                      <img
                        src={productImageUrl(item.fcId)}
                        alt=""
                        style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 4, background: '#f5f5f5', display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{item.fcId}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.productName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        {[item.category, item.subcategory].filter(Boolean).join(' > ')}
                        {item.brand ? ` · ${item.brand}` : ''}
                      </div>
                      {item.couponCode && (
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                          Coupon: <span style={{ fontFamily: 'monospace' }}>{item.couponCode}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      ₹{Number(item.mrp).toLocaleString('en-IN')}<br />
                      <span style={{ color: 'var(--text2)', fontSize: 12 }}>₹{Number(item.ctc).toLocaleString('en-IN')}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {item.offer
                        ? <span style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 13 }}>{item.offer}</span>
                        : <span style={{ color: 'var(--text2)' }}>—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {item.matchedStatus === 'matched' && (
                        <span className="chip chip-green">Matched ✓</span>
                      )}
                      {item.matchedStatus === 'not_found' && (
                        <span className="chip chip-red">Not Found</span>
                      )}
                      {item.matchedStatus === 'pending' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                          <button
                            className="btn btn-sm"
                            style={{ background: 'none', border: 'none', color: '#1a6fc4', cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'underline', padding: 0 }}
                            onClick={() => setStatus(item.id, 'matched')}
                          >Mark as Matched</button>
                          <button
                            className="btn btn-sm"
                            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'underline', padding: 0 }}
                            onClick={() => setStatus(item.id, 'not_found')}
                          >Mark as Not Found</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && allItems.length > 0 && !loading && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>
          No products match the current filter.
        </div>
      )}
    </>
  );
}

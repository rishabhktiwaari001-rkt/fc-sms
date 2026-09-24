import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';

interface Product {
  id: string;
  productId: string;
  productName: string;
  brandId: string | null;
  mrp: number;
  ctc: number;
  quantity: number;
  scannedQty: number;
  scannedBy: string | null;
  scannedAt: string | null;
  barcode: string | null;
  boxId: string | null;
  stockType: string | null;
}

interface LoadDetail {
  id: string;
  loadId: string;
  warehouseId: string;
  courier: string;
  docket: string;
  boxes: number;
  totalMrp: number;
  totalCtc: number;
  comment: string | null;
  importedBy: string;
  importedAt: string;
  closedAt: string | null;
  products: Product[];
}

export default function LoadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: load, loading, error, refetch } = useFetch<LoadDetail>(`/loads/${id}`);
  const [scanInput, setScanInput] = useState('');
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await api.post(`/loads/${id}/scan`, { code: trimmed });
      const p: Product = res.data.data;
      const status = p.scannedQty > p.quantity ? 'EXCESS' : p.scannedQty === p.quantity ? 'OK' : 'scanning…';
      setScanMsg({ text: `✓ ${p.productName} — Scanned ${p.scannedQty}/${p.quantity} ${status !== 'scanning…' ? `[${status}]` : ''}`, ok: true });
      refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Scan failed';
      setScanMsg({ text: `✗ ${msg}`, ok: false });
    } finally {
      setScanning(false);
      setScanInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleScan(scanInput);
  }

  async function resetScans() {
    if (!confirm('Reset all scan counts to 0?')) return;
    await api.post(`/loads/${id}/scan/reset`);
    refetch();
  }

  async function closeLoad() {
    if (!confirm('Mark this load as closed? It will move to View Stock.')) return;
    await api.patch(`/loads/${id}`, { close: true });
    refetch();
    navigate('/stock');
  }

  if (loading) return <div className="loading">Loading load details…</div>;
  if (error || !load) return <div className="error-box">{error ?? 'Load not found'}</div>;

  const products = load.products ?? [];
  const totItem = products.reduce((s, p) => s + p.quantity, 0);
  const totScanned = products.reduce((s, p) => s + (p.scannedQty ?? 0), 0);

  let totOk = 0, totShort = 0, totExcess = 0;
  for (const p of products) {
    const sq = p.scannedQty ?? 0;
    if (sq === p.quantity) totOk++;
    else if (sq < p.quantity) totShort++;
    else totExcess++;
  }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/stock')}>← Back</button>
          <div>
            <div className="page-title" style={{ fontSize: 18 }}>Load: {load.loadId || load.id}</div>
            <div className="page-sub">
              {load.warehouseId} · {load.courier} · {load.docket}
              {load.closedAt
                ? <span className="chip chip-green" style={{ marginLeft: 8 }}>Closed</span>
                : <span className="chip chip-amber" style={{ marginLeft: 8 }}>Open</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text2)' }} onClick={resetScans}>
            Reset Scans
          </button>
          {!load.closedAt && (
            <button className="btn btn-brand btn-sm" onClick={closeLoad}>
              ✓ Close Load
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Tot Items', value: totItem, color: 'var(--text1)' },
          { label: 'Scanned', value: totScanned, color: 'var(--brand)' },
          { label: 'Short', value: totShort, color: 'var(--red)' },
          { label: 'Excess', value: totExcess, color: 'var(--amber)' },
          { label: 'OK', value: totOk, color: 'var(--green)' },
          { label: 'MRP', value: `₹${Number(load.totalMrp).toLocaleString('en-IN')}`, color: 'var(--text1)' },
          { label: 'CTC', value: `₹${Number(load.totalCtc).toLocaleString('en-IN')}`, color: 'var(--text2)' },
          { label: 'Boxes', value: load.boxes, color: 'var(--text1)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Scan input */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 20 }}>📷</div>
          <input
            ref={inputRef}
            className="inp"
            style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 14 }}
            placeholder="Scan barcode or type Product ID and press Enter…"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            disabled={scanning}
          />
          <button
            className="btn btn-brand"
            disabled={scanning || !scanInput.trim()}
            onClick={() => handleScan(scanInput)}
          >
            Scan
          </button>
        </div>
        {scanMsg && (
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: scanMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: scanMsg.ok ? 'var(--green)' : 'var(--red)',
            border: `1px solid ${scanMsg.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            {scanMsg.text}
          </div>
        )}
      </div>

      {/* Products table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product ID</th>
                <th>Product Name</th>
                <th>Box ID</th>
                <th style={{ textAlign: 'center' }}>Order Qty</th>
                <th style={{ textAlign: 'center' }}>Scanned</th>
                <th>MRP / CTC</th>
                <th>Status</th>
                <th>Matched By</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>
                    No products in this load
                  </td>
                </tr>
              )}
              {products.map((p, i) => {
                const sq = p.scannedQty ?? 0;
                const status = sq === 0 ? 'pending'
                  : sq < p.quantity ? 'short'
                  : sq === p.quantity ? 'ok'
                  : 'excess';
                const statusLabel = { pending: 'Pending', short: `Short (${p.quantity - sq})`, ok: 'OK', excess: `Excess (+${sq - p.quantity})` }[status];
                const chipClass = { pending: 'chip-gray', short: 'chip-red', ok: 'chip-green', excess: 'chip-amber' }[status];
                return (
                  <tr key={p.id} style={{ background: status === 'ok' ? 'rgba(16,185,129,0.04)' : status === 'short' ? 'rgba(239,68,68,0.03)' : '' }}>
                    <td style={{ color: 'var(--text2)', fontSize: 11 }}>{i + 1}</td>
                    <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{p.productId}</td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ fontSize: 13, lineHeight: 1.3 }}>{p.productName}</div>
                      {p.barcode && <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>📦 {p.barcode}</div>}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{p.boxId ?? '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.quantity}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: sq === 0 ? 'var(--text2)' : sq >= p.quantity ? 'var(--green)' : 'var(--amber)' }}>
                        {sq}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>₹{Number(p.mrp).toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>₹{Number(p.ctc).toLocaleString('en-IN')}</div>
                    </td>
                    <td><span className={`chip ${chipClass}`}>{statusLabel}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {p.scannedBy
                        ? <><div>{p.scannedBy}</div><div style={{ fontSize: 10 }}>{p.scannedAt ? new Date(p.scannedAt).toLocaleString('en-IN') : ''}</div></>
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import ProductImage from '../components/ProductImage';

interface BoxItem {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  age: number | null;
  mrp: number;
  ctc: number;
  quantity: number;
  scannedBy: string | null;
  scannedAt: string;
}

interface StoreBox {
  id: string;
  name: string;
  date: string;
  closedAt: string | null;
  totalQty: number;
  totalMrp: number;
  totalCtc: number;
  createdBy: string;
  items: BoxItem[];
}

export default function StoreRoomDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: box, loading, error, refetch } = useFetch<StoreBox>(`/storeroom/boxes/${id}`);

  const [scanInput, setScanInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean; productId?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [closing, setClosing] = useState(false);
  const [adjusting, setAdjusting] = useState<string | null>(null); // item id being adjusted

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await api.post(`/storeroom/boxes/${id}/scan`, { code: trimmed });
      const { item, catalog } = res.data.data;
      setScanMsg({
        text: `✓ ${item.productName} — Qty: ${item.quantity}  |  MRP ₹${Number(catalog.mrp).toLocaleString('en-IN')}`,
        ok: true,
        productId: item.productId,
      });
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

  async function adjustQty(itemId: string, delta: 1 | -1) {
    setAdjusting(itemId);
    try {
      await api.patch(`/storeroom/items/${itemId}`, { delta });
      refetch();
    } catch { /* silent */ }
    finally { setAdjusting(null); }
  }

  async function closeBox() {
    if (!confirm(`Close "${box?.name}"? This will lock the box and compute totals.`)) return;
    setClosing(true);
    try {
      await api.post(`/storeroom/boxes/${id}/close`);
      refetch();
    } finally { setClosing(false); }
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error || !box) return <div className="error-box">{error ?? 'Box not found'}</div>;

  const isOpen = !box.closedAt;
  const items  = box.items ?? [];

  // Live totals from items (for open box) or from DB (for closed box)
  const liveMrp = isOpen
    ? items.reduce((s, i) => s + i.mrp * i.quantity, 0)
    : box.totalMrp;
  const liveCtc = isOpen
    ? items.reduce((s, i) => s + i.ctc * i.quantity, 0)
    : box.totalCtc;
  const liveQty = isOpen
    ? items.reduce((s, i) => s + i.quantity, 0)
    : box.totalQty;

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/storeroom')}>← Back</button>
          <div>
            <div className="page-title" style={{ fontSize:18 }}>{box.name}</div>
            <div className="page-sub">
              📅 {new Date(box.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
              &nbsp;·&nbsp; by {box.createdBy}
              {isOpen
                ? <span className="chip chip-amber" style={{ marginLeft:8 }}>Open</span>
                : <span className="chip chip-green" style={{ marginLeft:8 }}>Closed</span>}
            </div>
          </div>
        </div>
        {isOpen && (
          <button
            className="btn btn-brand btn-sm"
            style={{ background:'var(--red)', borderColor:'var(--red)' }}
            disabled={closing || items.length === 0}
            onClick={closeBox}
          >
            {closing ? '⟳ Closing…' : '🔒 Close Box'}
          </button>
        )}
      </div>

      {/* Summary stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Total Qty',  value: liveQty,  color:'var(--brand)' },
          { label:'Total MRP',  value: `₹${Number(liveMrp).toLocaleString('en-IN')}`, color:'var(--text1)' },
          { label:'Total CTC',  value: `₹${Number(liveCtc).toLocaleString('en-IN')}`, color:'var(--text2)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding:'14px 18px', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Closed box summary notice */}
      {!isOpen && (
        <div className="card" style={{
          padding:'12px 18px', marginBottom:16,
          background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.25)',
          display:'flex', alignItems:'center', gap:10,
        }}>
          <span style={{ fontSize:18 }}>✅</span>
          <div>
            <div style={{ fontWeight:600, fontSize:13 }}>Box Closed</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>
              Closed on {new Date(box.closedAt!).toLocaleString('en-IN')}
              &nbsp;·&nbsp; {items.length} product{items.length !== 1 ? 's' : ''}, {liveQty} units
            </div>
          </div>
        </div>
      )}

      {/* Scan input — only for open boxes */}
      {isOpen && (
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:20 }}>📷</span>
            <input
              ref={inputRef}
              className="inp"
              style={{ flex:1, fontFamily:'var(--mono)', fontSize:14 }}
              placeholder="Scan barcode or type Product ID and press Enter…"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScan(scanInput)}
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
              marginTop:10, padding:'8px 12px', borderRadius:6, fontSize:13, fontWeight:500,
              background: scanMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: scanMsg.ok ? 'var(--green)' : 'var(--red)',
              border:`1px solid ${scanMsg.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              display:'flex', alignItems:'center', gap:8,
            }}>
              {scanMsg.productId && <ProductImage productId={scanMsg.productId} size={32} />}
              {scanMsg.text}
            </div>
          )}
        </div>
      )}

      {/* Items table */}
      <div className="card" style={{ padding:0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Brand</th>
                <th>Age</th>
                <th>MRP</th>
                <th>CTC</th>
                <th style={{ textAlign:'center' }}>Qty</th>
                {isOpen && <th style={{ textAlign:'center' }}>Adjust</th>}
                <th>Last Scanned</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={isOpen ? 9 : 8} style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>
                    {isOpen ? 'No items yet — scan a product above' : 'No items in this box'}
                  </td>
                </tr>
              )}
              {[...items]
                .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
                .map((item, i) => (
                  <tr key={item.id}>
                    <td style={{ color:'var(--text2)', fontSize:11 }}>{i + 1}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <ProductImage productId={item.productId} size={40} />
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, lineHeight:1.3, maxWidth:240 }}>
                            {item.productName}
                          </div>
                          <div style={{ fontSize:11, color:'var(--text2)', fontFamily:'var(--mono)' }}>
                            {item.productId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:12, color:'var(--text2)' }}>{item.brand || '—'}</td>
                    <td style={{ fontSize:12, color:'var(--text2)' }}>
                      {item.age != null ? `${item.age}M` : '—'}
                    </td>
                    <td style={{ fontWeight:600, fontSize:13 }}>
                      ₹{Number(item.mrp).toLocaleString('en-IN')}
                    </td>
                    <td style={{ fontSize:12, color:'var(--text2)' }}>
                      ₹{Number(item.ctc).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <span style={{ fontWeight:700, fontSize:16, color:'var(--brand)' }}>
                        {item.quantity}
                      </span>
                    </td>

                    {/* +/- buttons only for open boxes */}
                    {isOpen && (
                      <td style={{ textAlign:'center' }}>
                        <div style={{ display:'flex', gap:4, justifyContent:'center', alignItems:'center' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding:'2px 8px', fontSize:16, lineHeight:1, color:'var(--red)' }}
                            disabled={adjusting === item.id}
                            onClick={() => adjustQty(item.id, -1)}
                            title="Remove 1"
                          >
                            −
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding:'2px 8px', fontSize:16, lineHeight:1, color:'var(--green)' }}
                            disabled={adjusting === item.id}
                            onClick={() => adjustQty(item.id, 1)}
                            title="Add 1"
                          >
                            +
                          </button>
                        </div>
                      </td>
                    )}

                    <td style={{ fontSize:11, color:'var(--text2)' }}>
                      <div>{item.scannedBy ?? '—'}</div>
                      <div style={{ fontSize:10 }}>
                        {item.scannedAt
                          ? new Date(item.scannedAt).toLocaleString('en-IN', { hour12:true, hour:'2-digit', minute:'2-digit' })
                          : ''}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Close Box button at bottom (repeat for easy access) */}
      {isOpen && items.length > 0 && (
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
          <button
            className="btn btn-brand"
            style={{ background:'var(--red)', borderColor:'var(--red)', padding:'10px 28px', fontSize:14 }}
            disabled={closing}
            onClick={closeBox}
          >
            {closing ? '⟳ Closing…' : '🔒 Close Box & Save Summary'}
          </button>
        </div>
      )}
    </>
  );
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';

interface StoreBox {
  id: string;
  name: string;
  date: string;
  closedAt: string | null;
  totalQty: number;
  totalMrp: number;
  totalCtc: number;
  createdBy: string;
  createdAt: string;
  itemCount: number;
  scannedQty: number;
}

interface SearchResult {
  id: string;
  boxId: string;
  boxName: string;
  boxDate: string;
  boxClosedAt: string | null;
  productId: string;
  productName: string;
  brand: string;
  mrp: number;
  ctc: number;
  quantity: number;
}

export default function StoreRoom() {
  const navigate = useNavigate();
  const { data: boxes, loading, error, refetch } = useFetch<StoreBox[]>('/storeroom/boxes');

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Search state
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setSearchResults(null);
    setSearchMsg(null);
    try {
      const res = await api.get(`/storeroom/search?q=${encodeURIComponent(q)}`);
      const data: SearchResult[] = res.data.data ?? [];
      if (data.length === 0) {
        setSearchMsg(`"${q}" किसी भी box में नहीं मिला`);
      } else {
        setSearchResults(data);
      }
    } catch {
      setSearchMsg('Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchQ('');
    setSearchResults(null);
    setSearchMsg(null);
  }

  async function createBox(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await api.post('/storeroom/boxes', { name: newName.trim(), date: newDate });
      setShowCreate(false);
      setNewName('');
      await refetch();
      navigate(`/storeroom/${res.data.data.id}`);
    } catch (err: any) {
      setCreateErr(err?.response?.data?.error ?? 'Failed to create box');
    } finally {
      setCreating(false);
    }
  }

  const open   = (boxes ?? []).filter(b => !b.closedAt);
  const closed = (boxes ?? []).filter(b =>  b.closedAt);

  if (loading) return <div className="loading">Loading Store Room…</div>;
  if (error)   return <div className="error-box">{error}</div>;

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Store Room</div>
          <div className="page-sub">
            {open.length} open · {closed.length} closed
          </div>
        </div>
        <button className="btn btn-brand btn-sm" onClick={() => setShowCreate(true)}>
          + New Box
        </button>
      </div>

      {/* Search bar */}
      <div className="card" style={{ marginBottom:20, padding:'14px 18px' }}>
        <form onSubmit={handleSearch} style={{ display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:16 }}>🔍</span>
          <input
            className="inp"
            style={{ flex:1, maxWidth:320 }}
            placeholder="Product ID search करें — किस box में है?"
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); if (!e.target.value) clearSearch(); }}
          />
          <button className="btn btn-brand btn-sm" type="submit" disabled={searching || !searchQ.trim()}>
            {searching ? '…' : 'Search'}
          </button>
          {(searchResults !== null || searchMsg) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearSearch}>✕ Clear</button>
          )}
        </form>

        {/* Search message (not found) */}
        {searchMsg && (
          <div style={{ marginTop:10, fontSize:13, color:'var(--text2)' }}>{searchMsg}</div>
        )}

        {/* Search results */}
        {searchResults && searchResults.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>
              {searchResults.length} result{searchResults.length > 1 ? 's' : ''} found
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product ID</th>
                    <th>Product Name</th>
                    <th>Brand</th>
                    <th style={{ textAlign:'center' }}>Qty in Box</th>
                    <th>MRP</th>
                    <th>Box</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map(r => (
                    <tr key={r.id}>
                      <td className="mono" style={{ fontSize:12, fontWeight:600 }}>{r.productId}</td>
                      <td style={{ fontSize:13, maxWidth:220 }}>{r.productName}</td>
                      <td style={{ fontSize:12, color:'var(--text2)' }}>{r.brand || '—'}</td>
                      <td style={{ textAlign:'center', fontWeight:700, color:'var(--brand)' }}>{r.quantity}</td>
                      <td style={{ fontWeight:600 }}>₹{Number(r.mrp).toLocaleString('en-IN')}</td>
                      <td style={{ fontWeight:600 }}>{r.boxName}</td>
                      <td>
                        {r.boxClosedAt
                          ? <span className="chip chip-green">Closed</span>
                          : <span className="chip chip-amber">Open</span>}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color:'var(--brand)', fontSize:12 }}
                          onClick={() => navigate(`/storeroom/${r.boxId}`)}
                        >
                          Box देखें →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Box modal */}
      {showCreate && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div className="card" style={{ width:360, padding:24 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:16 }}>Create New Box</div>
            <form onSubmit={createBox}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>Box Name</label>
                <input
                  className="inp"
                  style={{ width:'100%' }}
                  placeholder="e.g. Box 1, Loft Box A…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:4 }}>Date</label>
                <input
                  type="date"
                  className="inp"
                  style={{ width:'100%' }}
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  required
                />
              </div>
              {createErr && (
                <div style={{ color:'var(--red)', fontSize:12, marginBottom:12 }}>{createErr}</div>
              )}
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => { setShowCreate(false); setCreateErr(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-brand btn-sm" disabled={creating}>
                  {creating ? 'Creating…' : 'Create & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Open Boxes */}
      {open.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--text2)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Open Boxes
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
            {open.map(box => (
              <BoxCard
                key={box.id}
                box={box}
                onClick={() => navigate(`/storeroom/${box.id}`)}
                onDelete={async () => {
                  await api.delete(`/storeroom/boxes/${box.id}`);
                  refetch();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {open.length === 0 && closed.length === 0 && (
        <div className="card" style={{ padding:48, textAlign:'center', color:'var(--text2)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
          <div style={{ fontWeight:600, fontSize:15, marginBottom:6 }}>No boxes yet</div>
          <div style={{ fontSize:13 }}>Click "New Box" to start scanning store room inventory</div>
        </div>
      )}

      {/* Closed Boxes */}
      {closed.length > 0 && (
        <div>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--text2)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Closed Boxes
          </div>
          <div className="card" style={{ padding:0 }}>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Box Name</th>
                    <th>Date</th>
                    <th style={{ textAlign:'center' }}>Items</th>
                    <th style={{ textAlign:'center' }}>Total Qty</th>
                    <th>Total MRP</th>
                    <th>Total CTC</th>
                    <th>Closed On</th>
                    <th>By</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(box => (
                    <tr key={box.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/storeroom/${box.id}`)}>
                      <td style={{ fontWeight:600 }}>
                        <span style={{ color:'var(--brand)' }}>{box.name}</span>
                        <span className="chip chip-green" style={{ marginLeft:8, fontSize:10 }}>Closed</span>
                      </td>
                      <td style={{ fontSize:12 }}>
                        {new Date(box.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                      </td>
                      <td style={{ textAlign:'center' }}>{box.itemCount}</td>
                      <td style={{ textAlign:'center', fontWeight:600 }}>{box.totalQty}</td>
                      <td style={{ fontWeight:600 }}>₹{Number(box.totalMrp).toLocaleString('en-IN')}</td>
                      <td style={{ color:'var(--text2)', fontSize:13 }}>₹{Number(box.totalCtc).toLocaleString('en-IN')}</td>
                      <td style={{ fontSize:12, color:'var(--text2)' }}>
                        {box.closedAt ? new Date(box.closedAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td style={{ fontSize:12, color:'var(--text2)' }}>{box.createdBy}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color:'var(--red)', padding:'3px 8px', fontSize:13 }}
                          onClick={async () => {
                            if (confirm(`Permanently delete "${box.name}"?`)) {
                              await api.delete(`/storeroom/boxes/${box.id}`);
                              refetch();
                            }
                          }}
                          title="Delete box"
                        >🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BoxCard({ box, onClick, onDelete }: { box: StoreBox; onClick: () => void; onDelete: () => void }) {
  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Permanently delete "${box.name}" and all its items?`)) onDelete();
  }

  return (
    <div
      className="card"
      style={{ padding:'16px 20px', cursor:'pointer', borderLeft:'3px solid var(--brand)' }}
      onClick={onClick}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ fontWeight:700, fontSize:15 }}>{box.name}</div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span className="chip chip-amber">Open</span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding:'2px 7px', fontSize:13, color:'var(--red)', lineHeight:1 }}
            onClick={handleDelete}
            title="Delete box"
          >
            🗑
          </button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:10 }}>
        📅 {new Date(box.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
        &nbsp;·&nbsp; by {box.createdBy}
      </div>
      <div style={{ display:'flex', gap:16 }}>
        <div>
          <div style={{ fontSize:10, color:'var(--text2)' }}>Products</div>
          <div style={{ fontWeight:700, fontSize:18 }}>{box.itemCount}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:'var(--text2)' }}>Total Qty</div>
          <div style={{ fontWeight:700, fontSize:18 }}>{box.scannedQty}</div>
        </div>
      </div>
      <div style={{ marginTop:8, fontSize:12, color:'var(--brand)', fontWeight:500 }}>
        Tap to scan →
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import ProductImage from '../components/ProductImage';
import { api } from '../lib/api';
import { Load } from '@fc-sms/types';

export default function ViewStock() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[] | null>(null);
  const [productSearching, setProductSearching] = useState(false);
  const { data: loads, loading, error, refetch } = useFetch<Load[]>('/loads');

  // Only closed loads
  const closed = (loads ?? []).filter(l => l.closedAt || l.closeDate);
  const filtered = closed.filter(l =>
    !search ||
    (l.loadId ?? l.id).toLowerCase().includes(search.toLowerCase()) ||
    l.docket.toLowerCase().includes(search.toLowerCase()) ||
    l.courier.toLowerCase().includes(search.toLowerCase())
  );

  async function saveComment(id: string, comment: string) {
    await api.patch(`/loads/${id}`, { comment });
  }

  async function searchProduct() {
    if (!productSearch.trim()) { setProductResults(null); return; }
    setProductSearching(true);
    try {
      const res = await api.get(`/loads/search-product?q=${encodeURIComponent(productSearch.trim())}`);
      setProductResults(res.data.data);
    } catch {
      setProductResults([]);
    } finally {
      setProductSearching(false);
    }
  }

  if (loading) return <div className="loading">Loading loads…</div>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">View Stock</div>
          <div className="page-sub">{filtered.length} closed load(s)</div>
        </div>
        <input
          className="inp"
          style={{ width: 240 }}
          placeholder="Search load, docket, courier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Product search */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text2)' }}>
            Search Product:
          </span>
          <input
            className="inp"
            style={{ flex: 1, maxWidth: 320 }}
            placeholder="Search FC Id / Product Name…"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchProduct()}
          />
          <button className="btn btn-brand btn-sm" onClick={searchProduct} disabled={productSearching}>
            {productSearching ? '…' : 'Search'}
          </button>
          {productResults !== null && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setProductResults(null); setProductSearch(''); }}>
              Clear
            </button>
          )}
        </div>

        {productResults !== null && (
          <div style={{ marginTop: 12 }}>
            {productResults.length === 0
              ? <div style={{ color: 'var(--text2)', fontSize: 13 }}>No products found for "{productSearch}"</div>
              : (
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product ID</th>
                        <th>Product Name</th>
                        <th>Load ID</th>
                        <th>MRP / CTC</th>
                        <th style={{ textAlign: 'center' }}>Qty</th>
                        <th>Imported</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productResults.map((r: any) => (
                        <tr key={r.id}>
                          <td className="mono" style={{ fontSize: 12 }}>{r.productId}</td>
                          <td style={{ fontSize: 13 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ProductImage productId={r.productId} size={36} />
                              <span>{r.productName}</span>
                            </div>
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontFamily: 'var(--mono)', fontSize: 11 }}
                              onClick={() => navigate(`/stock/${r._loadId}`)}
                            >
                              {r._loadId}
                            </button>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>₹{Number(r.mrp).toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)' }}>₹{Number(r.ctc).toLocaleString('en-IN')}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{r.quantity}</td>
                          <td style={{ fontSize: 11 }}>{r.importedAt ? new Date(r.importedAt).toLocaleDateString('en-IN') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}
      </div>

      {/* Loads table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Load ID</th>
                <th>WH</th>
                <th>Courier</th>
                <th>Docket</th>
                <th>Boxes</th>
                <th>MRP / CTC</th>
                <th>Comment</th>
                <th>Import Date / By</th>
                <th>Close Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
                    No closed loads yet. Close a load in Match Stock to see it here.
                  </td>
                </tr>
              )}
              {filtered.map(load => (
                <LoadRow
                  key={load.id}
                  load={load}
                  onNavigate={() => navigate(`/stock/${load.id}`)}
                  onSaveComment={(c) => saveComment(load.id, c)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function LoadRow({ load, onNavigate, onSaveComment }: {
  load: Load;
  onNavigate: () => void;
  onSaveComment: (c: string) => void;
}) {
  const [comment, setComment] = useState(load.comment ?? '');

  return (
    <tr>
      <td>
        <button
          onClick={onNavigate}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: 'var(--brand)', fontFamily: 'var(--mono)', fontSize: 12,
            fontWeight: 700, textDecoration: 'underline',
          }}
        >
          {load.loadId || load.id}
        </button>
      </td>
      <td style={{ fontSize: 12 }}>{load.warehouseId}</td>
      <td style={{ fontSize: 12 }}>{load.courier}</td>
      <td className="mono" style={{ fontSize: 11 }}>{load.docket}</td>
      <td style={{ textAlign: 'center' }}>{load.boxes}</td>
      <td>
        <div style={{ fontWeight: 600 }}>₹{Number(load.totalMrp).toLocaleString('en-IN')}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>₹{Number(load.totalCtc).toLocaleString('en-IN')}</div>
      </td>
      <td>
        <textarea
          style={{
            width: 140, height: 44, resize: 'none',
            background: 'var(--bg1)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '4px 6px', fontSize: 11,
            fontFamily: 'var(--font)', color: 'var(--text1)', outline: 'none',
          }}
          value={comment}
          onChange={e => setComment(e.target.value)}
          onBlur={() => onSaveComment(comment)}
          placeholder="Add comment…"
        />
      </td>
      <td>
        <div style={{ fontSize: 12 }}>
          {new Date(load.importedAt ?? load.importDate).toLocaleDateString('en-IN')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
          {load.importedBy}
        </div>
      </td>
      <td>
        <span className="chip chip-green">
          {new Date(load.closedAt ?? load.closeDate!).toLocaleDateString('en-IN')}
        </span>
      </td>
    </tr>
  );
}

import React, { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';

interface InvReport { id: string; importedAt: string; importedBy: string; totalQty: number; rowCount: number; }
interface CatalogCategoryRow { category: string; totalQty: number; totalMrp: number; totalCtc: number; productCount: number; subCount: number; brands: string; subcategoryList: string; }
interface CatalogSubcategoryRow { subcategory: string; totalQty: number; totalMrp: number; totalCtc: number; productCount: number; brands: string; }
interface ArticleProduct { id: string; fcId: string | null; productId: string; productName: string; brand: string; mrp: number; ctc: number; age: string | null; gender: string | null; quantity: number; }

type View = 'categories' | 'subcategories' | 'articles';

function fmtQty(n: number | null | undefined) { return Number(n || 0).toLocaleString('en-IN'); }
function fmtRs(n: number | null | undefined) {
  return `Rs.${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function ctcPct(mrp: number, ctc: number) {
  return mrp > 0 ? ((ctc / mrp) * 100).toFixed(2) : '0.00';
}
function truncateList(s: string, maxLen = 120): string {
  if (!s) return '';
  const parts = s.split(',').map(b => b.trim()).filter(Boolean);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const next = out ? out + ', ' + parts[i] : parts[i];
    if (next.length > maxLen) {
      return out + ' & more...';
    }
    out = next;
  }
  return out;
}

function truncateBrands(s: string, maxLen = 100): string {
  return truncateList(s, maxLen);
}

// Try FC product image URL by productId
function productImageUrl(productId: string) {
  return `https://www.firstcry.com/assetsv2/imgs/products/medium/${productId}-1.jpg`;
}

export default function Catalog() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('categories');
  const [selCategory, setSelCategory] = useState('');
  const [selSubcategory, setSelSubcategory] = useState('');
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean; preview?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick(t => t + 1), []);

  const { data: latestReport } = useFetch<InvReport | null>('/catalog/inventory/latest', { _tick: tick });
  const { data: activeAudits, refetch: refetchAudits } = useFetch<Array<{ id: string; category: string; subcategory: string; startedAt: string }>>('/audits/active-list', { _tick: tick });
  // Map: category → active audit id (for "Scan Products" buttons)
  const activeAuditMap = new Map((activeAudits ?? []).map(a => [a.category, a]));

  const catUrl = '/catalog/categories';
  const subUrl = selCategory ? `/catalog/categories/${encodeURIComponent(selCategory)}` : null;
  const artUrl = selCategory && selSubcategory
    ? `/catalog/categories/${encodeURIComponent(selCategory)}/${encodeURIComponent(selSubcategory)}`
    : null;

  const { data: categories, loading: catLoading } = useFetch<CatalogCategoryRow[]>(catUrl, { _tick: tick });
  const { data: subcategories, loading: subLoading } = useFetch<CatalogSubcategoryRow[]>(subUrl ?? '', { _tick: tick }, { skip: !subUrl });
  const { data: products, loading: artLoading } = useFetch<ArticleProduct[]>(artUrl ?? '', { _tick: tick }, { skip: !artUrl });

  const grandTotal    = (categories ?? []).reduce((s, c) => s + (c.totalQty || 0), 0);
  const grandTotalMrp = (categories ?? []).reduce((s, c) => s + (c.totalMrp || 0), 0);
  const grandTotalCtc = (categories ?? []).reduce((s, c) => s + (c.totalCtc || 0), 0);

  function goCategory(cat: string) { setSelCategory(cat); setSelSubcategory(''); setView('subcategories'); }
  function goSubcategory(sub: string) { setSelSubcategory(sub); setView('articles'); }
  function navHome() { setView('categories'); setSelCategory(''); setSelSubcategory(''); }
  function navCategory() { setView('subcategories'); setSelSubcategory(''); }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/catalog/import-inventory', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = res.data.data;
      setMsg({ text: `✓ Imported ${d.rowCount} rows — Total Qty: ${d.totalQty.toLocaleString('en-IN')}`, ok: true });
      setView('categories'); bump();
    } catch (err: any) {
      const respData = err?.response?.data;
      setMsg({ text: `✗ ${respData?.error ?? err?.message ?? 'Import failed'}`, ok: false, preview: respData?.preview });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function syncFromLoads() {
    setSyncing(true); setMsg(null);
    try {
      const res = await api.post('/catalog/sync-from-loads', {});
      const d = res.data.data;
      setMsg({ text: `✓ Synced ${d.synced} products from closed loads into catalog`, ok: true });
      bump();
    } catch (err: any) {
      setMsg({ text: `✗ ${err?.response?.data?.error ?? 'Sync failed'}`, ok: false });
    } finally { setSyncing(false); }
  }

  async function startAudit(category: string, subcategory = '') {
    try {
      const res = await api.post('/audits', { category, subcategory });
      const auditId = res.data.data?.id;
      if (auditId) navigate(`/audits/${auditId}?new=1`);
    } catch (err: any) {
      setMsg({ text: `✗ ${err?.response?.data?.error ?? 'Failed to start audit'}`, ok: false });
    }
  }

  async function endAudit(auditId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('End this audit? This cannot be undone.')) return;
    try {
      await api.patch(`/audits/${auditId}/close`);
      bump(); refetchAudits();
    } catch (err: any) {
      setMsg({ text: `✗ ${err?.response?.data?.error ?? 'Failed to end audit'}`, ok: false });
    }
  }

  const loading = catLoading || subLoading || artLoading;
  const hasCatalogData = (categories ?? []).length > 0;
  const hasReport = !!(latestReport && latestReport.id);

  // Subcategory totals
  const subTotalQty  = (subcategories ?? []).reduce((s, r) => s + (r.totalQty || 0), 0);
  const subTotalMrp  = (subcategories ?? []).reduce((s, r) => s + (r.totalMrp || 0), 0);
  const subTotalCtc  = (subcategories ?? []).reduce((s, r) => s + (r.totalCtc || 0), 0);

  // Article totals (products is now a flat array from /catalog/categories/:cat/:sub)
  const artProducts = products ?? [];
  const artTotalQty = artProducts.reduce((s, p) => s + (p.quantity || 0), 0);
  const artTotalMrp = artProducts.reduce((s, p) => s + (p.quantity || 0) * (p.mrp || 0), 0);
  const artTotalCtc = artProducts.reduce((s, p) => s + (p.quantity || 0) * (p.ctc || 0), 0);

  return (
    <>
      {/* ── Header bar ── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {view !== 'categories' && (
            <button className="btn btn-ghost btn-sm" onClick={view === 'articles' ? navCategory : navHome}>← Back</button>
          )}
          <div>
            <div className="page-title">Catalog</div>
            <div className="page-sub" style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ cursor: view !== 'categories' ? 'pointer' : 'default', color: view !== 'categories' ? 'var(--brand)' : 'inherit', textDecoration: view !== 'categories' ? 'underline' : 'none' }} onClick={navHome}>All Categories</span>
              {selCategory && (<><span style={{ color: 'var(--text2)' }}>›</span><span style={{ cursor: view === 'articles' ? 'pointer' : 'default', color: view === 'articles' ? 'var(--brand)' : 'inherit', textDecoration: view === 'articles' ? 'underline' : 'none' }} onClick={view === 'articles' ? navCategory : undefined}>{selCategory}</span></>)}
              {selSubcategory && (<><span style={{ color: 'var(--text2)' }}>›</span><span>{selSubcategory}</span></>)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={syncing} onClick={syncFromLoads}>
            {syncing ? '⟳ Syncing…' : '⟳ Sync from Loads'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-brand btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? '⟳ Importing…' : '↑ Update Inventory'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {msg && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: msg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: msg.ok ? 'var(--green)' : 'var(--red)', border: `1px solid ${msg.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}>✕</button>
          {msg.preview && msg.preview.length > 0 && (
            <pre style={{ marginTop: 8, padding: '8px 10px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', background: 'rgba(0,0,0,0.15)', color: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
              {msg.preview.join('\n')}
            </pre>
          )}
        </div>
      )}

      {loading && <div className="loading">Loading…</div>}

      {/* No inventory */}
      {!loading && !hasCatalogData && !catLoading && view === 'categories' && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Inventory Data</div>
          <div style={{ color: 'var(--text2)', marginBottom: 20 }}>Upload your daily stock report CSV to see category-wise inventory.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-brand" onClick={() => fileRef.current?.click()}>↑ Upload Inventory CSV</button>
            <button className="btn btn-ghost" onClick={syncFromLoads} disabled={syncing}>⟳ Sync from Loads</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CATEGORIES VIEW — table of top-level cats
          ══════════════════════════════════════════ */}
      {view === 'categories' && hasCatalogData && !catLoading && (
        <div className="card" style={{ padding: 0 }}>
          {/* Grand total header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Select Category below to view products</div>
            <div style={{ fontSize: 13, color: '#c00', fontWeight: 600 }}>
              Total Qty: {fmtQty(grandTotal)} | Total MRP: {fmtRs(grandTotalMrp)} | Total CTC: {fmtRs(grandTotalCtc)}
            </div>
            {hasReport && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                Last updated: {latestReport?.importedAt ? new Date(latestReport.importedAt).toLocaleDateString('en-IN') : ''} by {latestReport?.importedBy ?? ''}
              </div>
            )}
          </div>

          {/* Category rows — neeviz list style */}
          {(categories ?? []).map((cat) => (
            <div key={cat.category} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Category name link */}
                <button
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#00c', fontSize: 18, fontWeight: 700, textDecoration: 'underline', textAlign: 'left' }}
                  onClick={() => goCategory(cat.category)}
                >
                  - {cat.category || '(Uncategorised)'}
                </button>
                {/* Stats line */}
                <div style={{ fontSize: 12, color: '#c00', fontWeight: 600, marginTop: 3 }}>
                  Total Qty: {fmtQty(cat.totalQty)} | Total MRP: {fmtRs(cat.totalMrp)} | Total CTC: {fmtRs(cat.totalCtc)} | CTC Percentage : {ctcPct(cat.totalMrp, cat.totalCtc)}%
                </div>
                {/* Subcategory list as text */}
                {cat.subcategoryList && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                    {truncateList(cat.subcategoryList, 150)}
                  </div>
                )}
              </div>
              {/* Audit button(s) */}
              {(() => {
                const active = activeAuditMap.get(cat.category);
                if (active) return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, marginTop: 4 }}>
                    <button className="btn btn-brand btn-sm" style={{ fontSize: 11 }} onClick={() => navigate(`/audits/${active.id}`)}>Scan Products</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--red)' }} onClick={(e) => endAudit(active.id, e)}>End Audit</button>
                  </div>
                );
                return (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0, marginTop: 4 }} onClick={() => startAudit(cat.category)}>
                    Start Audit
                  </button>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════
          SUBCATEGORIES VIEW — styled rows with brands
          ══════════════════════════════════════════ */}
      {view === 'subcategories' && !subLoading && (
        <div className="card" style={{ padding: 0 }}>
          {/* Selected category header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>You selected :</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{selCategory}</div>
            <div style={{ fontSize: 13, color: '#c00', fontWeight: 600, marginTop: 4 }}>
              Total Qty: {fmtQty(subTotalQty)} | Total MRP: {fmtRs(subTotalMrp)} | Total CTC: {fmtRs(subTotalCtc)} | CTC Percentage : {ctcPct(subTotalMrp, subTotalCtc)}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Select Sub-Category below to view products</div>
          </div>

          {/* Subcategory rows */}
          {(subcategories ?? []).length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>No subcategories found.</div>
          )}
          {(subcategories ?? []).map((sub) => (
            <div key={sub.subcategory} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Subcategory name link */}
                <button
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#00c', fontSize: 17, fontWeight: 700, textDecoration: 'underline', textAlign: 'left' }}
                  onClick={() => goSubcategory(sub.subcategory)}
                >
                  {sub.subcategory || '(no subcategory)'}
                </button>
                {/* Stats line */}
                <div style={{ fontSize: 12, color: '#c00', fontWeight: 600, marginTop: 3 }}>
                  Total Qty: {fmtQty(sub.totalQty)}
                  {sub.totalMrp > 0 && (
                    <> | Total MRP: {fmtRs(sub.totalMrp)} | Total CTC: {fmtRs(sub.totalCtc)} | CTC Percentage : {ctcPct(sub.totalMrp, sub.totalCtc)}%</>
                  )}
                </div>
                {/* Brands */}
                {sub.brands && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                    <strong>Brands:</strong> {truncateBrands(sub.brands)}
                  </div>
                )}
              </div>
              {/* Start Audit button */}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0, marginTop: 2 }} onClick={() => startAudit(selCategory, sub.subcategory)}>
                Start Audit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════
          ARTICLES VIEW — individual products table
          ══════════════════════════════════════════ */}
      {view === 'articles' && !artLoading && (
        <>
          {/* Back navigation links */}
          <div style={{ marginBottom: 14, fontSize: 13, textAlign: 'center' }}>
            <span>Back to : </span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00c', textDecoration: 'underline', fontSize: 13, padding: 0 }} onClick={navHome}>Category List</button>
            <span> | </span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00c', textDecoration: 'underline', fontSize: 13, padding: 0 }} onClick={navCategory}>Sub-Category List</button>
          </div>

          {/* Selected header */}
          <div className="card" style={{ padding: '14px 20px', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>You selected :</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>
              <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#00c', textDecoration: 'underline', fontWeight: 700, fontSize: 17 }} onClick={navCategory}>{selCategory}</button>
              <span style={{ fontWeight: 400, color: 'var(--text1)' }}> &gt; {selSubcategory}</span>
            </div>
            <div style={{ fontSize: 13, color: '#c00', fontWeight: 600, marginTop: 6 }}>
              Total Qty: {fmtQty(artTotalQty)} Pcs. | Total MRP: {fmtRs(artTotalMrp)} | Total CTC : {fmtRs(artTotalCtc)}
            </div>
          </div>

          {/* Products table */}
          <div className="card" style={{ padding: 0 }}>
            {artProducts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>
                No products found. Upload the stock CSV to populate the catalog.
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}></th>
                      <th style={{ width: 100 }}>Id</th>
                      <th>Product Name</th>
                      <th style={{ textAlign: 'right' }}>Available Quantity</th>
                      <th style={{ textAlign: 'right' }}>MRP</th>
                      <th style={{ textAlign: 'right' }}>CTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artProducts.map((p) => {
                      const fcId = p.fcId || p.productId;
                      return (
                        <tr key={p.id}>
                          {/* Product image */}
                          <td style={{ padding: '8px 10px' }}>
                            <img
                              src={productImageUrl(p.productId)}
                              alt=""
                              style={{ width: 60, height: 60, objectFit: 'contain', display: 'block', borderRadius: 4, background: '#f5f5f5' }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </td>
                          {/* FC Id */}
                          <td style={{ fontSize: 12, color: 'var(--text2)', verticalAlign: 'top', paddingTop: 12 }}>{fcId}</td>
                          {/* Product name + subtitle */}
                          <td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text1)', lineHeight: 1.3 }}>{p.productName}</div>
                            {(p.brand || p.age || p.gender) && (
                              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
                                {[p.brand, p.age, p.gender].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </td>
                          {/* Available Qty */}
                          <td style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top', paddingTop: 12 }}>
                            {fmtQty(p.quantity)} Pcs
                          </td>
                          {/* MRP */}
                          <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 12 }}>
                            {fmtRs(p.mrp)}
                          </td>
                          {/* CTC */}
                          <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 12 }}>
                            {fmtRs(p.ctc)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg2)', fontWeight: 600 }}>
                      <td colSpan={3} style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)', paddingRight: 12 }}>Grand Total ({artProducts.length} products)</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtQty(artTotalQty)} Pcs</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtRs(artTotalMrp)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtRs(artTotalCtc)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

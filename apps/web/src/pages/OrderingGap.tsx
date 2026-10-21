import React, { useState, useCallback } from 'react';

interface OGRow {
  subcategory: string;
  afsSize: string;
  soldQty: number;
  last3Qty: number;
  monthlyAvg: number;
  currentStock: number;
  monthsCover: number;
  portalCount: number;
  gap: number;
  status: 'critical' | 'low' | 'ok' | 'overstock' | 'dump';
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  const dmyShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmyShort) return new Date(2000 + +dmyShort[3], +dmyShort[2] - 1, +dmyShort[1]);
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function loadXLSX(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.XLSX) { resolve(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error('Could not load SheetJS from CDN. Check internet connection.'));
    document.head.appendChild(s);
  });
}

function ogKey(sub: string, size: string) {
  return `${sub.trim().toLowerCase()}||${size.trim().toUpperCase()}`;
}

export default function OrderingGap() {
  const [ogCSFile, setOgCSFile] = useState<File | null>(null);
  const [ogSSFile, setOgSSFile] = useState<File | null>(null);
  const [ogASRFile, setOgASRFile] = useState<File | null>(null);
  const [ogData, setOgData] = useState<OGRow[] | null>(null);
  const [ogLoading, setOgLoading] = useState(false);
  const [ogError, setOgError] = useState<string | null>(null);
  const [ogStatusFilter, setOgStatusFilter] = useState<'all'|'critical'|'low'|'ok'|'overstock'|'dump'>('all');
  const [ogSubcatFilter, setOgSubcatFilter] = useState('All');

  const card = { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const th = { padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textAlign: 'left' as const, borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' as const };
  const td = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const };
  const tdR = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  const selectStyle = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 };
  const badge = (color: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color });

  const analyzeOrderingGap = useCallback(async () => {
    if (!ogSSFile || !ogASRFile) { setOgError('Please upload Secondary Stock and ASR files first.'); return; }
    setOgLoading(true); setOgError(null); setOgData(null);
    try {
      const XLSX = await loadXLSX();

      // 1. Parse CS Inventory XLSX — optional
      const csMap = new Map<string, number>();
      const csLoaded = !!ogCSFile;
      if (ogCSFile) {
        await new Promise<void>((res, rej) => {
          const fr = new FileReader();
          fr.onload = ev => {
            try {
              const wb = XLSX.read(ev.target?.result, { type: 'binary' });
              const sheetName = wb.SheetNames.find((n: string) => /final.*north/i.test(n)) ?? wb.SheetNames[0];
              const ws = wb.Sheets[sheetName];
              const rows2: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
              for (const r of rows2) {
                const sub: string = (r['Subcategory Name'] || r['SubcategoryName'] || r['SubCategory Name'] || '').trim();
                const size: string = (r['AFS Size'] || r['AFSSize'] || r['Size'] || '').trim();
                if (!sub || !size) continue;
                const k = ogKey(sub, size);
                csMap.set(k, (csMap.get(k) || 0) + 1);
              }
              res();
            } catch (e: any) { rej(new Error('CS Inventory parse error: ' + e.message)); }
          };
          fr.onerror = () => rej(new Error('Failed to read CS Inventory file'));
          fr.readAsBinaryString(ogCSFile);
        });
      }

      // 2. Parse Secondary Stock XLSX — Sheet2
      const ssMap = new Map<string, number>();
      const ssSubNameMap = new Map<string, string>();
      await new Promise<void>((res, rej) => {
        const fr = new FileReader();
        fr.onload = ev => {
          try {
            const wb = XLSX.read(ev.target?.result, { type: 'binary' });
            const sheetName = wb.SheetNames.find((n: string) => /sheet2/i.test(n)) ?? wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const rows2: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
            for (const r of rows2) {
              const sub: string = (r['SubCategoryName'] || r['SubCategory Name'] || r['SubcategoryName'] || '').trim();
              const size: string = (r['AFS Size'] || r['AFSSize'] || r['Size'] || '').trim();
              const stock = parseFloat(r['CurrentStock'] || r['Current Stock'] || '0') || 0;
              if (!sub || !size) continue;
              const k = ogKey(sub, size);
              if (!ssSubNameMap.has(k)) ssSubNameMap.set(k, sub);
              if (stock > 0) ssMap.set(k, (ssMap.get(k) || 0) + stock);
            }
            res();
          } catch (e: any) { rej(new Error('Secondary Stock parse error: ' + e.message)); }
        };
        fr.onerror = () => rej(new Error('Failed to read Secondary Stock file'));
        fr.readAsBinaryString(ogSSFile);
      });

      // 3. Parse ASR CSV
      const LAST3_MONTHS = new Set(['2026-08', '2026-09', '2026-10']);
      const ASR_TOTAL_MONTHS = 7;
      const asrMap = new Map<string, number>();
      const asr3Map = new Map<string, number>();
      const asrSubNameMap = new Map<string, string>();
      await new Promise<void>((res, rej) => {
        const fr = new FileReader();
        fr.onload = ev => {
          try {
            const raw = parseCSV(ev.target?.result as string);
            for (const r of raw) {
              const sub: string = (r['SubCategory'] || r['Sub Category'] || r['Subcategory'] || '').trim();
              const size: string = (r['AFSSize'] || r['AFS Size'] || r['Size'] || '').trim();
              const qty = parseFloat(r['Quantity'] || '0') || 0;
              if (!sub || !size || qty <= 0) continue;
              const dateStr: string = (r['BillDate'] || r['Bill Date'] || r['Date'] || '').trim();
              const date = parseDate(dateStr);
              const k = ogKey(sub, size);
              asrMap.set(k, (asrMap.get(k) || 0) + qty);
              if (date) {
                const mk = monthKey(date);
                if (LAST3_MONTHS.has(mk)) asr3Map.set(k, (asr3Map.get(k) || 0) + qty);
              }
              if (!asrSubNameMap.has(k)) asrSubNameMap.set(k, sub);
            }
            res();
          } catch (e: any) { rej(new Error('ASR parse error: ' + e.message)); }
        };
        fr.onerror = () => rej(new Error('Failed to read ASR file'));
        fr.readAsText(ogASRFile);
      });

      // 4. Build result
      const allKeys = new Set([...csMap.keys(), ...ssMap.keys(), ...asrMap.keys()]);
      const result: OGRow[] = [];
      for (const k of allKeys) {
        const sold = asrMap.get(k) || 0;
        const last3 = asr3Map.get(k) || 0;
        const monthlyAvg = sold / ASR_TOTAL_MONTHS;
        const stock = ssMap.get(k) || 0;
        const portal = csMap.get(k) || 0;
        const gap = sold - stock;
        const monthsCover = monthlyAvg > 0 ? stock / monthlyAvg : (stock > 0 ? 999 : 0);
        const [rawSub, rawSize] = k.split('||');
        const subName = ssSubNameMap.get(k) || asrSubNameMap.get(k) || rawSub;

        const isOverstock = stock >= monthlyAvg * 5 && stock > 0;
        const expectedLast3 = monthlyAvg * 3;
        const isDump = isOverstock && (last3 <= 2 || last3 < expectedLast3 * 0.5);

        let status: OGRow['status'];
        if (gap > 0 && csLoaded && portal > 0) status = 'critical';
        else if (gap > 0 && csLoaded && portal === 0) status = 'low';
        else if (gap > 0 && !csLoaded) status = 'critical';
        else if (isDump) status = 'dump';
        else if (isOverstock) status = 'overstock';
        else status = 'ok';

        result.push({ subcategory: subName, afsSize: rawSize, soldQty: Math.round(sold), last3Qty: Math.round(last3), monthlyAvg: Math.round(monthlyAvg * 10) / 10, currentStock: Math.round(stock), monthsCover: Math.round(monthsCover * 10) / 10, portalCount: portal, gap, status });
      }
      const statusOrder = { critical: 0, low: 1, dump: 2, overstock: 3, ok: 4 };
      result.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.gap - a.gap);
      setOgData(result);
    } catch (e: any) { setOgError(e.message); }
    setOgLoading(false);
  }, [ogCSFile, ogSSFile, ogASRFile]);

  const fileInputStyle: React.CSSProperties = { display: 'none' };
  const uploadCard = (label: string, icon: string, desc: string, file: File | null, inputId: string, onChange: (f: File | null) => void) => (
    <div style={{ ...card, flex: 1, minWidth: 220, cursor: 'pointer', marginBottom: 0 }} onClick={() => document.getElementById(inputId)?.click()}>
      <input id={inputId} type="file" style={fileInputStyle} accept=".xlsx,.xls,.csv"
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{desc}</div>
      {file
        ? <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✔ {file.name}</div>
        : <div style={{ fontSize: 12, color: 'var(--text2)' }}>Click to upload</div>}
    </div>
  );

  const filteredOG = (ogData ?? []).filter(r => {
    if (ogStatusFilter !== 'all' && r.status !== ogStatusFilter) return false;
    if (ogSubcatFilter !== 'All' && r.subcategory !== ogSubcatFilter) return false;
    return true;
  });

  const ogSubcats = ogData ? ['All', ...Array.from(new Set(ogData.map(r => r.subcategory))).sort()] : ['All'];

  const statusBadge = (s: OGRow['status']) => {
    const map: Record<string, [string, string]> = {
      critical: ['🔴', '#dc2626'],
      low:      ['🟡', '#d97706'],
      ok:       ['🟢', '#059669'],
      overstock:['🔵', '#2563eb'],
      dump:     ['💀', '#7c3aed'],
    };
    const [ico, col] = map[s] ?? ['⬜', 'var(--text2)'];
    return <span style={badge(col)}>{ico} {s.charAt(0).toUpperCase() + s.slice(1)}</span>;
  };

  const summary = ogData ? {
    critical:  ogData.filter(r => r.status === 'critical').length,
    low:       ogData.filter(r => r.status === 'low').length,
    dump:      ogData.filter(r => r.status === 'dump').length,
    overstock: ogData.filter(r => r.status === 'overstock').length,
    ok:        ogData.filter(r => r.status === 'ok').length,
    totalGap:  ogData.filter(r => r.gap > 0).reduce((s, r) => s + r.gap, 0),
    dumpUnits: ogData.filter(r => r.status === 'dump').reduce((s, r) => s + r.currentStock, 0),
  } : null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">🛒 Ordering Gap</div>
          <div className="page-sub">Identify fast-moving SKUs with low/no stock — upload 3 reports to analyse</div>
        </div>
      </div>

      {/* File upload section */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Upload Reports</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {uploadCard('CS Inventory Report', '🏬', 'Portal availability — C&S North India (optional)', ogCSFile, 'og-cs-input', f => { setOgCSFile(f); setOgData(null); })}
          {uploadCard('Secondary Stock Report', '📦', 'Current store stock by SKU (Sheet2 = raw data)', ogSSFile, 'og-ss-input', f => { setOgSSFile(f); setOgData(null); })}
          {uploadCard('ASR — Article Sale Report', '📈', 'What sold Apr–Oct 2026 (CSV)', ogASRFile, 'og-asr-input', f => { setOgASRFile(f); setOgData(null); })}
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={analyzeOrderingGap}
            disabled={!ogSSFile || !ogASRFile || ogLoading}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: (!ogSSFile || !ogASRFile || ogLoading) ? 'var(--bg2)' : '#1d4ed8', color: (!ogSSFile || !ogASRFile || ogLoading) ? 'var(--text2)' : '#fff', fontWeight: 700, fontSize: 14, cursor: (!ogSSFile || !ogASRFile || ogLoading) ? 'not-allowed' : 'pointer' }}>
            {ogLoading ? '⏳ Analysing…' : '🔍 Analyse Ordering Gap'}
          </button>
          {ogData && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{ogData.length} SKU combinations found</span>}
        </div>
        {ogError && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>⚠️ {ogError}</div>}
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { label: '🔴 Critical (can order)', val: summary.critical, col: '#dc2626' },
            { label: '🟡 Low (not on portal)', val: summary.low, col: '#d97706' },
            { label: '💀 Dump Stock SKUs', val: summary.dump, col: '#7c3aed' },
            { label: '💀 Dump Stock Units', val: summary.dumpUnits, col: '#7c3aed' },
            { label: '🔵 Overstock', val: summary.overstock, col: '#2563eb' },
            { label: '🟢 OK / Sufficient', val: summary.ok, col: '#059669' },
            { label: '📦 Total Units Gap', val: summary.totalGap, col: 'var(--red)' },
          ].map(c => (
            <div key={c.label} style={{ ...card, flex: '1 1 140px', marginBottom: 0, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.col }}>{c.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters + table */}
      {ogData && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginRight: 6 }}>Ordering Gap by SKU</div>
            <select value={ogSubcatFilter} onChange={e => setOgSubcatFilter(e.target.value)} style={selectStyle}>
              {ogSubcats.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={ogStatusFilter} onChange={e => setOgStatusFilter(e.target.value as any)} style={selectStyle}>
              <option value="all">All Statuses</option>
              <option value="critical">🔴 Critical</option>
              <option value="low">🟡 Low</option>
              <option value="dump">💀 Dump Stock</option>
              <option value="overstock">🔵 Overstock</option>
              <option value="ok">🟢 OK</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 'auto' }}>{filteredOG.length} rows</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  {['Sub Category', 'AFS Size', 'Sold (Apr–Oct)', 'Last 3M (A/S/O)', 'Mo. Avg', 'Curr Stock', 'Mo. Cover', 'Gap', ...(ogCSFile ? ['Portal'] : []), 'Status'].map(h => (
                    <th key={h} style={{ ...th, textAlign: h === 'Sub Category' || h === 'AFS Size' ? 'left' : 'right', ...(h === 'Status' ? { textAlign: 'center' as const } : {}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOG.length === 0
                  ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text2)', padding: 32 }}>No rows match current filters</td></tr>
                  : filteredOG.map((r, i) => {
                    const gapCol = r.gap > 0 ? 'var(--red)' : 'var(--text2)';
                    const coverCol = r.monthsCover >= 5 ? '#7c3aed' : r.monthsCover >= 3 ? '#d97706' : r.monthsCover > 0 ? 'var(--green)' : 'var(--text2)';
                    const isDumpRow = r.status === 'dump';
                    return (
                      <tr key={i} style={{ background: isDumpRow ? 'rgba(124,58,237,0.06)' : i % 2 === 0 ? 'var(--bg1)' : 'var(--bg2)' }}>
                        <td style={td}>{r.subcategory}</td>
                        <td style={td}>{r.afsSize}</td>
                        <td style={tdR}>{r.soldQty}</td>
                        <td style={{ ...tdR, color: r.last3Qty <= 2 ? 'var(--red)' : 'var(--text1)', fontWeight: r.last3Qty <= 2 ? 700 : 400 }}>{r.last3Qty}</td>
                        <td style={{ ...tdR, color: 'var(--text2)' }}>{r.monthlyAvg.toFixed(1)}</td>
                        <td style={tdR}>{r.currentStock}</td>
                        <td style={{ ...tdR, color: coverCol, fontWeight: 700 }}>
                          {r.monthsCover >= 99 ? '∞' : r.monthsCover.toFixed(1)}M
                        </td>
                        <td style={{ ...tdR, color: gapCol, fontWeight: r.gap > 0 ? 700 : 400 }}>
                          {r.gap > 0 ? `+${r.gap}` : r.gap === 0 ? '—' : r.gap}
                        </td>
                        {ogCSFile && <td style={{ ...tdR, color: r.portalCount > 0 ? 'var(--green)' : 'var(--text2)' }}>
                          {r.portalCount > 0 ? r.portalCount : '—'}
                        </td>}
                        <td style={{ ...td, textAlign: 'center' }}>{statusBadge(r.status)}</td>
                      </tr>
                    );
                  })}
              </tbody>
              {filteredOG.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total ({filteredOG.length} SKUs)</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{filteredOG.reduce((s,r)=>s+r.soldQty,0)}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: 'var(--red)' }}>{filteredOG.reduce((s,r)=>s+r.last3Qty,0)}</td>
                    <td style={{ ...tdR, color: 'var(--text2)' }}>—</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{filteredOG.reduce((s,r)=>s+r.currentStock,0)}</td>
                    <td style={tdR}>—</td>
                    <td style={{ ...tdR, fontWeight: 700, color: 'var(--red)' }}>
                      {(() => { const g = filteredOG.filter(r=>r.gap>0).reduce((s,r)=>s+r.gap,0); return g > 0 ? `+${g}` : '—'; })()}
                    </td>
                    {ogCSFile && <td style={{ ...tdR, fontWeight: 700 }}>{filteredOG.reduce((s,r)=>s+r.portalCount,0)}</td>}
                    <td style={td}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>
            🔴 Critical = need to order{ogCSFile ? ' (on portal)' : ''} · 🟡 Low = need to order (not on portal) · 💀 Dump = 5M+ cover &amp; last 3M sold ≤2 or &lt;50% avg · 🔵 Overstock = 5M+ cover but still moving · 🟢 OK = healthy · Mo.Cover = months of stock on hand at current avg
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useCallback, useMemo } from 'react';

interface SaleRow {
  BillDate: Date;
  MonthKey: string;   // "YYYY-MM"
  MonthLabel: string; // "Apr 2026"
  SalesPerson: string;
  GSV: number;
  Quantity: number;
  InvoiceNumber: string;
  ProductName: string;
  Category: string;
  SubCategory: string;
  Week: number;
  WeekLabel: string;
  DayName: string;
  isMembership: boolean;
}

interface StaffStat {
  rank: number;
  name: string;
  gsv: number;
  qty: number;
  bills: number;
  singleBills: number;
  avpt: number;
  aupt: number;
  singlePct: number;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[+m - 1]} ${y}`;
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
  // DD/MM/YYYY — 4-digit year
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  // DD/MM/YY — 2-digit year (e.g. "01/04/26" = 1 Apr 2026)
  const dmyShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmyShort) return new Date(2000 + +dmyShort[3], +dmyShort[2] - 1, +dmyShort[1]);
  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function processRows(raw: Record<string, string>[]): SaleRow[] {
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return raw.map(r => {
    const sp = r['SalesPerson'] || r['SalePerson'] || r['Salesperson'] || '';
    const dateStr = r['BillDate'] || r['Bill Date'] || r['Date'] || '';
    const gsv = parseFloat(r['GSV'] || '0') || 0;
    const qty = parseFloat(r['Quantity'] || r['Qty'] || '0') || 0;
    const inv = r['InvoiceNumber'] || r['Invoice'] || r['InvoiceNo'] || '';
    const prod = r['ProductName'] || r['Product'] || '';
    const cat = r['Category'] || '';
    const sub = r['SubCategory'] || r['Sub Category'] || r['Subcategory'] || '';
    const date = parseDate(dateStr);
    if (!date) return null;
    const day = date.getDate();
    const week = Math.ceil(day / 7);
    const isMem = /membership/i.test(prod) || cat === 'GiftCertificate';
    const mk = monthKey(date);
    return {
      BillDate: date, MonthKey: mk, MonthLabel: monthLabel(mk),
      SalesPerson: sp.trim(), GSV: gsv, Quantity: qty,
      InvoiceNumber: inv, ProductName: prod, Category: cat, SubCategory: sub,
      Week: week, WeekLabel: `Week ${week}`, DayName: DAYS[date.getDay()],
      isMembership: isMem,
    };
  }).filter(Boolean) as SaleRow[];
}

function fmtRs(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildStaffStats(rows: SaleRow[]): StaffStat[] {
  const map: Record<string, { gsv: number; qty: number; invs: Set<string>; invQty: Map<string, number> }> = {};
  for (const r of rows) {
    if (!map[r.SalesPerson]) map[r.SalesPerson] = { gsv: 0, qty: 0, invs: new Set(), invQty: new Map() };
    const s = map[r.SalesPerson];
    s.gsv += r.GSV; s.qty += r.Quantity; s.invs.add(r.InvoiceNumber);
    s.invQty.set(r.InvoiceNumber, (s.invQty.get(r.InvoiceNumber) || 0) + r.Quantity);
  }
  return Object.entries(map).map(([name, s]) => {
    const bills = Math.max(s.invs.size, 1);
    const singleBills = [...s.invQty.values()].filter(q => q <= 2).length;
    return {
      rank: 0, name, gsv: s.gsv, qty: s.qty, bills, singleBills,
      avpt: Math.round(s.gsv / bills),
      aupt: Math.round((s.qty / bills) * 100) / 100,
      singlePct: Math.round((singleBills / bills) * 1000) / 10,
    };
  }).sort((a, b) => b.gsv - a.gsv).map((s, i) => ({ ...s, rank: i + 1 }));
}

export default function RetailMatrix() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selMonth, setSelMonth] = useState('All');
  const [selCat, setSelCat] = useState('All');
  const [selSub, setSelSub] = useState('All');
  const [transpose, setTranspose] = useState(false);

  const TABS = ['🏆 Rankings', '🔍 Category', '💳 Memberships', '📅 Sales Reports', '⚠️ Less than 2 Qty Bills', '📆 Monthly Breakdown'];

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(null); setRows([]); setSelMonth('All');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = parseCSV(ev.target?.result as string);
        const processed = processRows(raw);
        if (!processed.length) throw new Error('No valid rows found. Check column names (BillDate, SalesPerson, GSV, Quantity, InvoiceNumber, Category).');
        setRows(processed);
      } catch (ex: any) { setError(ex.message); }
      setLoading(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // All base sales rows (no membership, no free sample)
  const salesRows = useMemo(() => rows.filter(r => !r.isMembership && r.Category !== 'Free Sample Category'), [rows]);

  // Available months sorted chronologically
  const availableMonths = useMemo(() => {
    const keys = Array.from(new Set(salesRows.map(r => r.MonthKey))).sort();
    return keys.map(k => ({ key: k, label: monthLabel(k) }));
  }, [salesRows]);

  // Month-filtered sales rows — used by ALL tabs
  const activeSalesRows = useMemo(() => {
    if (selMonth === 'All') return salesRows;
    return salesRows.filter(r => r.MonthKey === selMonth);
  }, [salesRows, selMonth]);

  // Membership rows (also month-filtered)
  const memRows = useMemo(() => {
    const base = rows.filter(r => r.isMembership);
    if (selMonth === 'All') return base;
    return base.filter(r => r.MonthKey === selMonth);
  }, [rows, selMonth]);

  const staffStats = useMemo(() => buildStaffStats(activeSalesRows), [activeSalesRows]);
  const maxWeek = useMemo(() => Math.max(0, ...activeSalesRows.map(r => r.Week)), [activeSalesRows]);

  const weeklyWinners = useMemo(() => {
    if (!maxWeek) return [];
    return buildStaffStats(activeSalesRows.filter(r => r.Week === maxWeek)).filter(s => s.aupt >= 4 && s.avpt >= 3000);
  }, [activeSalesRows, maxWeek]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(activeSalesRows.map(r => r.Category).filter(Boolean))).sort()], [activeSalesRows]);
  const subCategories = useMemo(() => {
    if (selCat === 'All') return ['All'];
    return ['All', ...Array.from(new Set(activeSalesRows.filter(r => r.Category === selCat).map(r => r.SubCategory).filter(Boolean))).sort()];
  }, [activeSalesRows, selCat]);

  const filteredCatRows = useMemo(() => {
    let f = activeSalesRows;
    if (selCat !== 'All') f = f.filter(r => r.Category === selCat);
    if (selSub !== 'All') f = f.filter(r => r.SubCategory === selSub);
    return f;
  }, [activeSalesRows, selCat, selSub]);

  const catStats = useMemo(() => {
    const total = filteredCatRows.reduce((s, r) => s + r.GSV, 0);
    const map: Record<string, { sales: number; qty: number; bills: Set<string> }> = {};
    for (const r of filteredCatRows) {
      if (!map[r.SalesPerson]) map[r.SalesPerson] = { sales: 0, qty: 0, bills: new Set() };
      map[r.SalesPerson].sales += r.GSV;
      map[r.SalesPerson].qty += r.Quantity;
      map[r.SalesPerson].bills.add(r.InvoiceNumber);
    }
    return { total, rows: Object.entries(map).map(([name, s]) => ({ name, sales: s.sales, qty: s.qty, bills: s.bills.size, contrib: total ? (s.sales / total) * 100 : 0 })).sort((a, b) => b.sales - a.sales) };
  }, [filteredCatRows]);

  const memHub = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const tiers = new Set<string>();
    for (const r of memRows) {
      const d = fmtDate(r.BillDate);
      const t = `₹${r.GSV}`;
      tiers.add(t);
      if (!map[d]) map[d] = {};
      map[d][t] = (map[d][t] || 0) + 1;
    }
    return { dates: Object.keys(map).sort((a, b) => b.localeCompare(a)), tierList: Array.from(tiers).sort(), map };
  }, [memRows]);

  const dayWise = useMemo(() => {
    const map: Record<string, { date: Date; day: string; gsv: number }> = {};
    for (const r of activeSalesRows) {
      const k = r.BillDate.toISOString().slice(0, 10);
      if (!map[k]) map[k] = { date: r.BillDate, day: r.DayName, gsv: 0 };
      map[k].gsv += r.GSV;
    }
    return Object.values(map).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activeSalesRows]);

  const weekWise = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of activeSalesRows) { map[r.WeekLabel] = (map[r.WeekLabel] || 0) + r.GSV; }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeSalesRows]);

  // Monthly Breakdown: staff × month matrix
  const monthlyBreakdown = useMemo(() => {
    const months = availableMonths.map(m => m.key);
    const staffSet = new Set(salesRows.map(r => r.SalesPerson));
    const staffList = Array.from(staffSet).sort();
    type CellData = { gsv: number; qty: number; bills: Set<string>; invQty: Map<string, number> };
    const grid: Record<string, Record<string, CellData>> = {};
    for (const r of salesRows) {
      if (!grid[r.SalesPerson]) grid[r.SalesPerson] = {};
      if (!grid[r.SalesPerson][r.MonthKey]) grid[r.SalesPerson][r.MonthKey] = { gsv: 0, qty: 0, bills: new Set(), invQty: new Map() };
      const cell = grid[r.SalesPerson][r.MonthKey];
      cell.gsv += r.GSV;
      cell.qty += r.Quantity;
      cell.bills.add(r.InvoiceNumber);
      cell.invQty.set(r.InvoiceNumber, (cell.invQty.get(r.InvoiceNumber) || 0) + r.Quantity);
    }
    // Monthly totals
    const monthTotals: Record<string, { gsv: number; bills: Set<string> }> = {};
    for (const mk of months) {
      monthTotals[mk] = { gsv: 0, bills: new Set() };
      for (const r of salesRows.filter(x => x.MonthKey === mk)) {
        monthTotals[mk].gsv += r.GSV;
        monthTotals[mk].bills.add(r.InvoiceNumber);
      }
    }
    return { months, staffList, grid, monthTotals };
  }, [salesRows, availableMonths]);

  const selectStyle = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 };
  const card = { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const th = { padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textAlign: 'left' as const, borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' as const };
  const td = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const };
  const tdR = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  const badge = (color: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color });

  const activeLabel = selMonth === 'All' ? 'All Months' : monthLabel(selMonth);
  const activeTotalGSV = activeSalesRows.reduce((s, r) => s + r.GSV, 0);
  const activeTotalBills = new Set(activeSalesRows.map(r => r.InvoiceNumber)).size;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">📊 Retail Matrix</div>
          <div className="page-sub">Staff rankings, category analysis &amp; KPIs — upload article sale report to begin</div>
        </div>
        <label style={{ cursor: 'pointer' }}>
          <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          <span className="btn btn-brand btn-sm">{loading ? '⟳ Loading…' : rows.length ? '🔄 Re-upload CSV' : '📂 Upload CSV'}</span>
        </label>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 13 }}>
          ✗ {error}
        </div>
      )}

      {!rows.length && !loading && (
        <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Upload Article Sale Report CSV</div>
          <div style={{ fontSize: 13 }}>Required columns: BillDate, SalesPerson, GSV, Quantity, InvoiceNumber, Category, SubCategory, ProductName</div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
            {[
              { label: `Total GSV${selMonth !== 'All' ? ` · ${activeLabel}` : ''}`, value: fmtRs(activeTotalGSV), color: '#1d4ed8' },
              { label: `Total Bills${selMonth !== 'All' ? ` · ${activeLabel}` : ''}`, value: activeTotalBills, color: '#059669' },
              { label: 'Staff Count', value: staffStats.length, color: '#7c3aed' },
              { label: 'File', value: fileName, color: '#b45309' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...card, marginBottom: 0, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Month filter pills */}
          {availableMonths.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginRight: 2 }}>📅 MONTH:</span>
              {[{ key: 'All', label: 'All Months' }, ...availableMonths].map(m => (
                <button
                  key={m.key}
                  onClick={() => setSelMonth(m.key)}
                  className={`btn btn-sm ${selMonth === m.key ? 'btn-brand' : 'btn-ghost'}`}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {TABS.map((t, i) => (
              <button key={i} onClick={() => setActiveTab(i)} className={`btn btn-sm ${activeTab === i ? 'btn-brand' : 'btn-ghost'}`} style={{ fontSize: 12 }}>{t}</button>
            ))}
          </div>

          {/* ── Tab 0: Rankings ── */}
          {activeTab === 0 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                🏆 Staff Rankings — {activeLabel}
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>{['Rank', 'Name', 'Total GSV', 'Qty', 'Bills', 'AVPT', 'AUPT', '≤2 Qty Bills', '≤2 Qty %'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {staffStats.map(s => (
                      <tr key={s.name}>
                        <td style={td}><span style={badge(s.rank === 1 ? '#f59e0b' : s.rank === 2 ? '#6b7280' : s.rank === 3 ? '#b45309' : '#1d4ed8')}>#{s.rank}</span></td>
                        <td style={{ ...td, fontWeight: 600 }}>{s.name}</td>
                        <td style={tdR}>{fmtRs(s.gsv)}</td>
                        <td style={tdR}>{s.qty}</td>
                        <td style={tdR}>{s.bills}</td>
                        <td style={tdR}>{fmtRs(s.avpt)}</td>
                        <td style={{ ...tdR, color: s.aupt >= 4 ? 'var(--green)' : 'var(--text1)' }}>{s.aupt.toFixed(2)}</td>
                        <td style={tdR}>{s.singleBills}</td>
                        <td style={{ ...tdR, color: s.singlePct > 30 ? 'var(--red)' : 'var(--text1)' }}>{s.singlePct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 8, background: 'var(--bg2)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>🎯 Weekly Incentive Qualifiers — Week {maxWeek} (AUPT ≥ 4 &amp; AVPT ≥ ₹3,000)</div>
                {weeklyWinners.length ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {weeklyWinners.map(w => (
                      <div key={w.name} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: 'var(--green)' }}>🎉 {w.name}</span>
                        <span style={{ color: 'var(--text2)', marginLeft: 10 }}>AVPT {fmtRs(w.avpt)} · AUPT {w.aupt.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>No qualifiers yet for Week {maxWeek} (AUPT ≥ 4 and AVPT ≥ ₹3,000 required)</div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab 1: Category ── */}
          {activeTab === 1 && (
            <div style={card}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Category</label>
                  <select value={selCat} onChange={e => { setSelCat(e.target.value); setSelSub('All'); }} style={selectStyle}>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Sub-Category</label>
                  <select value={selSub} onChange={e => setSelSub(e.target.value)} style={selectStyle}>
                    {subCategories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
                  <input type="checkbox" checked={transpose} onChange={e => setTranspose(e.target.checked)} />
                  🔄 Transpose View
                </label>
                <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
                  {activeLabel} · Total: {fmtRs(catStats.total)}
                </div>
              </div>
              <div className="tbl-wrap">
                {!transpose ? (
                  <table>
                    <thead><tr>{['SalesPerson', 'Sales', 'Contrib %', 'Qty', 'Bills'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {catStats.rows.map(r => (
                        <tr key={r.name}>
                          <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                          <td style={tdR}>{fmtRs(r.sales)}</td>
                          <td style={tdR}>{r.contrib.toFixed(1)}%</td>
                          <td style={tdR}>{r.qty}</td>
                          <td style={tdR}>{r.bills}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead><tr><th style={th}>KPI</th>{catStats.rows.map(r => <th key={r.name} style={th}>{r.name}</th>)}</tr></thead>
                    <tbody>
                      {(['Sales', 'Contrib %', 'Qty', 'Bills'] as const).map(kpi => (
                        <tr key={kpi}>
                          <td style={{ ...td, fontWeight: 600 }}>{kpi}</td>
                          {catStats.rows.map(r => (
                            <td key={r.name} style={tdR}>
                              {kpi === 'Sales' ? fmtRs(r.sales) : kpi === 'Contrib %' ? `${r.contrib.toFixed(1)}%` : kpi === 'Qty' ? r.qty : r.bills}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Tab 2: Memberships ── */}
          {activeTab === 2 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>💳 Membership Hub — {activeLabel}</div>
              {memRows.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>No memberships found in data.</div>
              ) : (
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th style={th}>Date</th>{memHub.tierList.map(t => <th key={t} style={th}>{t}</th>)}</tr></thead>
                    <tbody>
                      {memHub.dates.map(d => (
                        <tr key={d}>
                          <td style={{ ...td, fontWeight: 600 }}>{d}</td>
                          {memHub.tierList.map(t => <td key={t} style={{ ...tdR, color: memHub.map[d]?.[t] ? 'var(--text1)' : 'var(--text2)' }}>{memHub.map[d]?.[t] || '—'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab 3: Sales Reports ── */}
          {activeTab === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📅 Day-wise Sales — {activeLabel}</div>
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th style={th}>Date</th><th style={th}>Day</th><th style={th}>GSV</th></tr></thead>
                    <tbody>
                      {dayWise.map(d => (
                        <tr key={d.date.toISOString()}>
                          <td style={{ ...td, fontWeight: 600 }}>{fmtDate(d.date)}</td>
                          <td style={{ ...td, color: 'var(--text2)' }}>{d.day}</td>
                          <td style={tdR}>{fmtRs(d.gsv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🗓️ Week-wise Sales — {activeLabel}</div>
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th style={th}>Week</th><th style={th}>GSV</th></tr></thead>
                    <tbody>{weekWise.map(([week, gsv]) => <tr key={week}><td style={{ ...td, fontWeight: 600 }}>{week}</td><td style={tdR}>{fmtRs(gsv)}</td></tr>)}</tbody>
                    <tfoot><tr style={{ background: 'var(--bg2)', fontWeight: 700 }}><td style={td}>Total</td><td style={tdR}>{fmtRs(weekWise.reduce((s, [, g]) => s + g, 0))}</td></tr></tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 4: Less than 2 Qty Bills ── */}
          {activeTab === 4 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⚠️ Less than 2 Qty Bills — {activeLabel}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>Staff with high ≤2 quantity bills need upselling improvement</div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>{['Rank', 'SalesPerson', 'Total Bills', '≤2 Qty Bills', '≤2 Qty %'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...staffStats].sort((a, b) => b.singlePct - a.singlePct).map(s => (
                      <tr key={s.name}>
                        <td style={td}>#{s.rank}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{s.name}</td>
                        <td style={tdR}>{s.bills}</td>
                        <td style={tdR}>{s.singleBills}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: s.singlePct > 40 ? 'var(--red)' : s.singlePct > 25 ? '#d97706' : 'var(--green)' }}>{s.singlePct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tab 5: Monthly Breakdown ── */}
          {activeTab === 5 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📆 Monthly Breakdown — All Staff × All Months</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>GSV / Bills per staff per month (use month pills above to drill into any month's tabs)</div>

              {/* Month totals row */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${monthlyBreakdown.months.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
                {monthlyBreakdown.months.map(mk => {
                  const mt = monthlyBreakdown.monthTotals[mk];
                  return (
                    <div
                      key={mk}
                      onClick={() => setSelMonth(mk === selMonth ? 'All' : mk)}
                      style={{ padding: '10px 12px', borderRadius: 8, background: selMonth === mk ? 'rgba(29,78,216,0.1)' : 'var(--bg2)', border: selMonth === mk ? '2px solid #1d4ed8' : '1px solid var(--border)', cursor: 'pointer', textAlign: 'center' }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: selMonth === mk ? '#1d4ed8' : 'var(--text2)', marginBottom: 3 }}>{monthLabel(mk)}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{fmtRs(mt.gsv)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{mt.bills.size} bills</div>
                    </div>
                  );
                })}
              </div>

              {/* GSV matrix */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text2)' }}>GSV by Staff × Month</div>
              <div className="tbl-wrap" style={{ marginBottom: 20 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={th}>Staff</th>
                      {monthlyBreakdown.months.map(mk => <th key={mk} style={{ ...th, textAlign: 'right' as const }}>{monthLabel(mk)}</th>)}
                      <th style={{ ...th, textAlign: 'right' as const, color: '#1d4ed8' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.staffList.map(name => {
                      const total = monthlyBreakdown.months.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.gsv || 0), 0);
                      return (
                        <tr key={name}>
                          <td style={{ ...td, fontWeight: 600 }}>{name}</td>
                          {monthlyBreakdown.months.map(mk => {
                            const gsv = monthlyBreakdown.grid[name]?.[mk]?.gsv || 0;
                            return <td key={mk} style={{ ...tdR, color: gsv ? 'var(--text1)' : 'var(--text2)' }}>{gsv ? fmtRs(gsv) : '—'}</td>;
                          })}
                          <td style={{ ...tdR, fontWeight: 700, color: '#1d4ed8' }}>{fmtRs(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                      <td style={td}>Month Total</td>
                      {monthlyBreakdown.months.map(mk => (
                        <td key={mk} style={{ ...tdR, color: '#059669' }}>{fmtRs(monthlyBreakdown.monthTotals[mk].gsv)}</td>
                      ))}
                      <td style={{ ...tdR, color: '#1d4ed8' }}>{fmtRs(monthlyBreakdown.months.reduce((s, mk) => s + monthlyBreakdown.monthTotals[mk].gsv, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Bills matrix */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text2)' }}>Bills by Staff × Month</div>
              <div className="tbl-wrap" style={{ marginBottom: 20 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={th}>Staff</th>
                      {monthlyBreakdown.months.map(mk => <th key={mk} style={{ ...th, textAlign: 'right' as const }}>{monthLabel(mk)}</th>)}
                      <th style={{ ...th, textAlign: 'right' as const, color: '#059669' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.staffList.map(name => {
                      const total = monthlyBreakdown.months.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.bills.size || 0), 0);
                      return (
                        <tr key={name}>
                          <td style={{ ...td, fontWeight: 600 }}>{name}</td>
                          {monthlyBreakdown.months.map(mk => {
                            const b = monthlyBreakdown.grid[name]?.[mk]?.bills.size || 0;
                            return <td key={mk} style={{ ...tdR, color: b ? 'var(--text1)' : 'var(--text2)' }}>{b || '—'}</td>;
                          })}
                          <td style={{ ...tdR, fontWeight: 700, color: '#059669' }}>{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                      <td style={td}>Month Total</td>
                      {monthlyBreakdown.months.map(mk => (
                        <td key={mk} style={{ ...tdR, color: '#059669' }}>{monthlyBreakdown.monthTotals[mk].bills.size}</td>
                      ))}
                      <td style={{ ...tdR, color: '#059669' }}>{new Set(salesRows.map(r => r.InvoiceNumber)).size}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ≤2 Qty Bills matrix */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text2)' }}>≤2 Qty Bills % by Staff × Month</div>
              <div className="tbl-wrap" style={{ marginBottom: 20 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={th}>Staff</th>
                      {monthlyBreakdown.months.map(mk => <th key={mk} style={{ ...th, textAlign: 'right' as const }}>{monthLabel(mk)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.staffList.map(name => (
                      <tr key={name}>
                        <td style={{ ...td, fontWeight: 600 }}>{name}</td>
                        {monthlyBreakdown.months.map(mk => {
                          const cell = monthlyBreakdown.grid[name]?.[mk];
                          if (!cell || cell.bills.size === 0) return <td key={mk} style={{ ...tdR, color: 'var(--text2)' }}>—</td>;
                          const single = [...cell.invQty.values()].filter(q => q <= 2).length;
                          const pct = (single / cell.bills.size) * 100;
                          return (
                            <td key={mk} style={{ ...tdR, fontWeight: 600, color: pct > 40 ? 'var(--red)' : pct > 25 ? '#d97706' : 'var(--green)' }}>
                              {pct.toFixed(0)}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* AVPT matrix */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text2)' }}>AVPT — Avg Value Per Transaction (GSV ÷ Bills) by Staff × Month</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>Higher = better; target ≥ ₹3,000</div>
              <div className="tbl-wrap" style={{ marginBottom: 20 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={th}>Staff</th>
                      {monthlyBreakdown.months.map(mk => <th key={mk} style={{ ...th, textAlign: 'right' as const }}>{monthLabel(mk)}</th>)}
                      <th style={{ ...th, textAlign: 'right' as const, color: '#1d4ed8' }}>Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.staffList.map(name => {
                      const totalGsv = monthlyBreakdown.months.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.gsv || 0), 0);
                      const totalBills = monthlyBreakdown.months.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.bills.size || 0), 0);
                      const overallAvpt = totalBills ? Math.round(totalGsv / totalBills) : 0;
                      return (
                        <tr key={name}>
                          <td style={{ ...td, fontWeight: 600 }}>{name}</td>
                          {monthlyBreakdown.months.map(mk => {
                            const cell = monthlyBreakdown.grid[name]?.[mk];
                            if (!cell || cell.bills.size === 0) return <td key={mk} style={{ ...tdR, color: 'var(--text2)' }}>—</td>;
                            const avpt = Math.round(cell.gsv / cell.bills.size);
                            return (
                              <td key={mk} style={{ ...tdR, fontWeight: 600, color: avpt >= 3000 ? 'var(--green)' : avpt >= 2000 ? '#d97706' : 'var(--red)' }}>
                                {fmtRs(avpt)}
                              </td>
                            );
                          })}
                          <td style={{ ...tdR, fontWeight: 700, color: overallAvpt >= 3000 ? 'var(--green)' : overallAvpt >= 2000 ? '#d97706' : 'var(--red)' }}>
                            {overallAvpt ? fmtRs(overallAvpt) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                      <td style={td}>Store Avg</td>
                      {monthlyBreakdown.months.map(mk => {
                        const mt = monthlyBreakdown.monthTotals[mk];
                        const avpt = mt.bills.size ? Math.round(mt.gsv / mt.bills.size) : 0;
                        return <td key={mk} style={{ ...tdR, color: avpt >= 3000 ? 'var(--green)' : avpt >= 2000 ? '#d97706' : 'var(--red)' }}>{fmtRs(avpt)}</td>;
                      })}
                      <td style={{ ...tdR, color: '#1d4ed8' }}>
                        {(() => { const tb = new Set(salesRows.map(r => r.InvoiceNumber)).size; const tg = salesRows.reduce((s,r)=>s+r.GSV,0); return tb ? fmtRs(Math.round(tg/tb)) : '—'; })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* AUPT matrix */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text2)' }}>AUPT — Avg Units Per Transaction (Qty ÷ Bills) by Staff × Month</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>Higher = better; target ≥ 4 units</div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={th}>Staff</th>
                      {monthlyBreakdown.months.map(mk => <th key={mk} style={{ ...th, textAlign: 'right' as const }}>{monthLabel(mk)}</th>)}
                      <th style={{ ...th, textAlign: 'right' as const, color: '#1d4ed8' }}>Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.staffList.map(name => {
                      const totalQty = monthlyBreakdown.months.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.qty || 0), 0);
                      const totalBills = monthlyBreakdown.months.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.bills.size || 0), 0);
                      const overallAupt = totalBills ? Math.round((totalQty / totalBills) * 100) / 100 : 0;
                      return (
                        <tr key={name}>
                          <td style={{ ...td, fontWeight: 600 }}>{name}</td>
                          {monthlyBreakdown.months.map(mk => {
                            const cell = monthlyBreakdown.grid[name]?.[mk];
                            if (!cell || cell.bills.size === 0) return <td key={mk} style={{ ...tdR, color: 'var(--text2)' }}>—</td>;
                            const aupt = Math.round((cell.qty / cell.bills.size) * 100) / 100;
                            return (
                              <td key={mk} style={{ ...tdR, fontWeight: 600, color: aupt >= 4 ? 'var(--green)' : aupt >= 3 ? '#d97706' : 'var(--red)' }}>
                                {aupt.toFixed(2)}
                              </td>
                            );
                          })}
                          <td style={{ ...tdR, fontWeight: 700, color: overallAupt >= 4 ? 'var(--green)' : overallAupt >= 3 ? '#d97706' : 'var(--red)' }}>
                            {overallAupt ? overallAupt.toFixed(2) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                      <td style={td}>Store Avg</td>
                      {monthlyBreakdown.months.map(mk => {
                        const mt = monthlyBreakdown.monthTotals[mk];
                        const totalQty = salesRows.filter(r => r.MonthKey === mk).reduce((s,r)=>s+r.Quantity,0);
                        const aupt = mt.bills.size ? Math.round((totalQty / mt.bills.size) * 100) / 100 : 0;
                        return <td key={mk} style={{ ...tdR, color: aupt >= 4 ? 'var(--green)' : aupt >= 3 ? '#d97706' : 'var(--red)' }}>{aupt.toFixed(2)}</td>;
                      })}
                      <td style={{ ...tdR, color: '#1d4ed8' }}>
                        {(() => { const tb = new Set(salesRows.map(r => r.InvoiceNumber)).size; const tq = salesRows.reduce((s,r)=>s+r.Quantity,0); return tb ? (Math.round((tq/tb)*100)/100).toFixed(2) : '—'; })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

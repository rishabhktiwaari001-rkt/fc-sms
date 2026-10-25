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


interface LosEntry {
  id: string; store: string; date: string; customerName: string; contactNo: string;
  category: string; subCategory: string; typeLevel: string; ageGroup: string;
  gender: string; priceRange: string; requirement: string; remark: string;
  status: string; staffName: string; followUpDate: string;
}
interface DsrManualEntry { target: number; walking: number; lySale: number; scrap: number; cmp: number; }

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


  // ── LOS Tracker tabs state ──
  const [losRows, setLosRows] = useState<LosEntry[]>(() => { try { return JSON.parse(localStorage.getItem('rm_los')||'[]'); } catch { return []; } });
  const [showLosForm, setShowLosForm] = useState(false);
  const [losForm, setLosForm] = useState<Partial<LosEntry>>({});
  const [losFilterCat, setLosFilterCat] = useState('');
  const [losFilterSub, setLosFilterSub] = useState('');
  const [losFilterDateFrom, setLosFilterDateFrom] = useState('');
  const [losFilterDateTo, setLosFilterDateTo] = useState('');
  const [losFilterAge, setLosFilterAge] = useState('');
  const [dsrManual, setDsrManual] = useState<Record<string,DsrManualEntry>>(() => { try { return JSON.parse(localStorage.getItem('rm_dsr')||'{}'); } catch { return {}; } });
  const [dsrEditing, setDsrEditing] = useState<string|null>(null);
  const [dsrEdit, setDsrEdit] = useState<Partial<DsrManualEntry>>({});
  const [dsrMonthlyTarget, setDsrMonthlyTarget] = useState<Record<string,number>>(() => { try { return JSON.parse(localStorage.getItem('rm_dsr_mt')||'{}'); } catch { return {}; } });
  const [dsrMtInput, setDsrMtInput] = useState<string>('');
  const [catTargets, setCatTargets] = useState<Record<string,{saleLy:number;qtyLy:number;target:number}>>(() => { try { return JSON.parse(localStorage.getItem('rm_cat')||'{}'); } catch { return {}; } });
  const [catEditing, setCatEditing] = useState<string|null>(null);
  const [catEditVals, setCatEditVals] = useState<Record<string,{saleLy:number;qtyLy:number;target:number}>>({});
  const [staffTargets, setStaffTargets] = useState<Record<string,{target:number;lySale:number}>>(() => { try { return JSON.parse(localStorage.getItem('rm_staff')||'{}'); } catch { return {}; } });
  const [staffEditing, setStaffEditing] = useState<string|null>(null);
  const [staffEditVals, setStaffEditVals] = useState<Record<string,{target:number;lySale:number}>>({});
  const [cmpData, setCmpData] = useState<Record<string,number>>(() => { try { return JSON.parse(localStorage.getItem('rm_cmp')||'{}'); } catch { return {}; } });
  const [cmpMonth, setCmpMonth] = useState<string>(() => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; });
  const [staffSelMonth, setStaffSelMonth] = useState<string>('All');
  const [staffViewMode, setStaffViewMode] = useState<'single'|'multi'|'drill'>('single');
  const [staffDrillStaff, setStaffDrillStaff] = useState<string>('');

  const saveLosRows = (r: LosEntry[]) => { setLosRows(r); try { localStorage.setItem('rm_los',JSON.stringify(r)); } catch {} };
  const saveDsrManual = (d: Record<string,DsrManualEntry>) => { setDsrManual(d); try { localStorage.setItem('rm_dsr',JSON.stringify(d)); } catch {} };
  const saveDsrMonthlyTarget = (d: Record<string,number>) => { setDsrMonthlyTarget(d); try { localStorage.setItem('rm_dsr_mt',JSON.stringify(d)); } catch {} };
  const saveCatTargets = (d: typeof catTargets) => { setCatTargets(d); try { localStorage.setItem('rm_cat',JSON.stringify(d)); } catch {} };
  const saveStaffTargets = (d: typeof staffTargets) => { setStaffTargets(d); try { localStorage.setItem('rm_staff',JSON.stringify(d)); } catch {} };
  const saveCmpData = (d: Record<string,number>) => { setCmpData(d); try { localStorage.setItem('rm_cmp',JSON.stringify(d)); } catch {} };

  const TABS = ['🏆 Rankings', '🔍 Category', '💳 Memberships', '📅 Sales Reports', '⚠️ Less than 2 Qty Bills', '📆 Monthly Breakdown', '📊 DSR', '📋 Cat Wise', '👥 Staff Wise', '😞 Loss of Sale', '🎯 CMP Tracker'];

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

      {!rows.length && !loading && activeTab < 6 && (
        <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Upload Article Sale Report CSV</div>
          <div style={{ fontSize: 13 }}>Required columns: BillDate, SalesPerson, GSV, Quantity, InvoiceNumber, Category, SubCategory, ProductName</div>
        </div>
      )}

      {/* Tab bar — always visible */}
      <div style={{ display:'flex', gap:4, marginBottom:16, flexWrap:'wrap' }}>
        {TABS.map((t,i)=>(
          <button key={i} onClick={()=>setActiveTab(i)} className={`btn btn-sm ${activeTab===i?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>{t}</button>
        ))}
      </div>

      {rows.length > 0 && activeTab < 6 && (
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
                  <tfoot>
                    {(() => {
                      const totalBills = staffStats.reduce((s, x) => s + x.bills, 0);
                      const totalSingle = staffStats.reduce((s, x) => s + x.singleBills, 0);
                      const totalPct = totalBills ? (totalSingle / totalBills) * 100 : 0;
                      const avgPct = staffStats.length ? staffStats.reduce((s, x) => s + x.singlePct, 0) / staffStats.length : 0;
                      return (
                        <>
                          <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                            <td style={td} colSpan={2}>Total</td>
                            <td style={tdR}>{totalBills}</td>
                            <td style={tdR}>{totalSingle}</td>
                            <td style={{ ...tdR, color: totalPct > 40 ? 'var(--red)' : totalPct > 25 ? '#d97706' : 'var(--green)' }}>{totalPct.toFixed(1)}%</td>
                          </tr>
                          <tr style={{ background: 'var(--bg2)', fontWeight: 700, borderTop: '1px dashed var(--border)' }}>
                            <td style={td} colSpan={2}>Store Avg / Staff</td>
                            <td style={{ ...tdR, color: 'var(--text2)' }}>{staffStats.length ? Math.round(totalBills / staffStats.length) : '—'}</td>
                            <td style={{ ...tdR, color: 'var(--text2)' }}>{staffStats.length ? Math.round(totalSingle / staffStats.length) : '—'}</td>
                            <td style={{ ...tdR, color: avgPct > 40 ? 'var(--red)' : avgPct > 25 ? '#d97706' : 'var(--green)' }}>{avgPct.toFixed(1)}%</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── Tab 5: Monthly Breakdown ── */}
          {activeTab === 5 && (() => {
            const visibleMonths = selMonth === 'All' ? monthlyBreakdown.months : monthlyBreakdown.months.filter(mk => mk === selMonth);
            const breakdownLabel = selMonth === 'All' ? 'All Months' : monthLabel(selMonth);
            return (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📆 Monthly Breakdown — All Staff × {breakdownLabel}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>Click a month card to drill into that month · click again to reset</div>

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

              {/* Unified Staff × Month matrix */}
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ ...th, minWidth: 110 }}>Staff</th>
                      <th style={{ ...th, minWidth: 80, color: 'var(--text2)' }}>Metric</th>
                      {visibleMonths.map(mk => <th key={mk} style={{ ...th, textAlign: 'right' as const, minWidth: 90 }}>{monthLabel(mk)}</th>)}
                      <th style={{ ...th, textAlign: 'right' as const, minWidth: 90, color: '#1d4ed8' }}>Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.staffList.map((name, si) => {
                      const totalGsv   = visibleMonths.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.gsv || 0), 0);
                      const totalBills = visibleMonths.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.bills.size || 0), 0);
                      const totalQty   = visibleMonths.reduce((s, mk) => s + (monthlyBreakdown.grid[name]?.[mk]?.qty || 0), 0);
                      const overallAvpt = totalBills ? Math.round(totalGsv / totalBills) : 0;
                      const overallAupt = totalBills ? Math.round((totalQty / totalBills) * 100) / 100 : 0;
                      const totalSingle = visibleMonths.reduce((s, mk) => {
                        const cell = monthlyBreakdown.grid[name]?.[mk];
                        if (!cell) return s;
                        return s + [...cell.invQty.values()].filter(q => q <= 2).length;
                      }, 0);
                      const overallSinglePct = totalBills ? (totalSingle / totalBills) * 100 : 0;
                      const rowBg = si % 2 === 0 ? 'var(--bg1)' : 'var(--bg2)';
                      const subTd = { ...td, background: rowBg, fontSize: 12 };
                      const subTdR = { ...tdR, background: rowBg, fontSize: 12 };
                      const label = (txt: string, color?: string) => (
                        <td style={{ ...subTd, color: color || 'var(--text2)', fontWeight: 600, paddingLeft: 10 }}>{txt}</td>
                      );
                      return (
                        <React.Fragment key={name}>
                          {/* GSV row */}
                          <tr>
                            <td style={{ ...subTd, fontWeight: 700, verticalAlign: 'top', borderTop: '2px solid var(--border)' }} rowSpan={5}>{name}</td>
                            {label('GSV', '#1d4ed8')}
                            {visibleMonths.map(mk => {
                              const gsv = monthlyBreakdown.grid[name]?.[mk]?.gsv || 0;
                              return <td key={mk} style={{ ...subTdR, borderTop: '2px solid var(--border)' }}>{gsv ? fmtRs(gsv) : <span style={{ color: 'var(--text2)' }}>—</span>}</td>;
                            })}
                            <td style={{ ...subTdR, fontWeight: 700, color: '#1d4ed8', borderTop: '2px solid var(--border)' }}>{fmtRs(totalGsv)}</td>
                          </tr>
                          {/* Bills row */}
                          <tr>
                            {label('Bills', '#059669')}
                            {visibleMonths.map(mk => {
                              const b = monthlyBreakdown.grid[name]?.[mk]?.bills.size || 0;
                              return <td key={mk} style={subTdR}>{b || <span style={{ color: 'var(--text2)' }}>—</span>}</td>;
                            })}
                            <td style={{ ...subTdR, fontWeight: 700, color: '#059669' }}>{totalBills}</td>
                          </tr>
                          {/* AVPT row */}
                          <tr>
                            {label('AVPT')}
                            {visibleMonths.map(mk => {
                              const cell = monthlyBreakdown.grid[name]?.[mk];
                              if (!cell || cell.bills.size === 0) return <td key={mk} style={{ ...subTdR, color: 'var(--text2)' }}>—</td>;
                              const avpt = Math.round(cell.gsv / cell.bills.size);
                              return <td key={mk} style={{ ...subTdR, color: avpt >= 3000 ? 'var(--green)' : avpt >= 2000 ? '#d97706' : 'var(--red)' }}>{fmtRs(avpt)}</td>;
                            })}
                            <td style={{ ...subTdR, fontWeight: 700, color: overallAvpt >= 3000 ? 'var(--green)' : overallAvpt >= 2000 ? '#d97706' : 'var(--red)' }}>{overallAvpt ? fmtRs(overallAvpt) : '—'}</td>
                          </tr>
                          {/* AUPT row */}
                          <tr>
                            {label('AUPT')}
                            {visibleMonths.map(mk => {
                              const cell = monthlyBreakdown.grid[name]?.[mk];
                              if (!cell || cell.bills.size === 0) return <td key={mk} style={{ ...subTdR, color: 'var(--text2)' }}>—</td>;
                              const aupt = Math.round((cell.qty / cell.bills.size) * 100) / 100;
                              return <td key={mk} style={{ ...subTdR, color: aupt >= 4 ? 'var(--green)' : aupt >= 3 ? '#d97706' : 'var(--red)' }}>{aupt.toFixed(2)}</td>;
                            })}
                            <td style={{ ...subTdR, fontWeight: 700, color: overallAupt >= 4 ? 'var(--green)' : overallAupt >= 3 ? '#d97706' : 'var(--red)' }}>{overallAupt ? overallAupt.toFixed(2) : '—'}</td>
                          </tr>
                          {/* ≤2 Qty% row */}
                          <tr>
                            {label('≤2 Qty%')}
                            {visibleMonths.map(mk => {
                              const cell = monthlyBreakdown.grid[name]?.[mk];
                              if (!cell || cell.bills.size === 0) return <td key={mk} style={{ ...subTdR, color: 'var(--text2)' }}>—</td>;
                              const single = [...cell.invQty.values()].filter(q => q <= 2).length;
                              const pct = (single / cell.bills.size) * 100;
                              return <td key={mk} style={{ ...subTdR, color: pct > 40 ? 'var(--red)' : pct > 25 ? '#d97706' : 'var(--green)' }}>{pct.toFixed(0)}%</td>;
                            })}
                            <td style={{ ...subTdR, fontWeight: 700, color: overallSinglePct > 40 ? 'var(--red)' : overallSinglePct > 25 ? '#d97706' : 'var(--green)' }}>{overallSinglePct.toFixed(1)}%</td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {/* Store totals */}
                    {(() => {
                      const storeGsv   = visibleMonths.reduce((s, mk) => s + monthlyBreakdown.monthTotals[mk].gsv, 0);
                      const storeBills = visibleMonths.reduce((s, mk) => s + monthlyBreakdown.monthTotals[mk].bills.size, 0);
                      const storeQty   = salesRows.filter(r => visibleMonths.includes(r.MonthKey)).reduce((s,r) => s + r.Quantity, 0);
                      const storeAvpt  = storeBills ? Math.round(storeGsv / storeBills) : 0;
                      const storeAupt  = storeBills ? Math.round((storeQty / storeBills) * 100) / 100 : 0;
                      const storeSingle = visibleMonths.reduce((s, mk) => {
                        return s + monthlyBreakdown.staffList.reduce((ss, name) => {
                          const cell = monthlyBreakdown.grid[name]?.[mk];
                          if (!cell) return ss;
                          return ss + [...cell.invQty.values()].filter(q => q <= 2).length;
                        }, 0);
                      }, 0);
                      const storeSinglePct = storeBills ? (storeSingle / storeBills) * 100 : 0;
                      const fw: React.CSSProperties = { background: 'var(--bg2)', fontWeight: 700 };
                      const footTd = { ...td, ...fw };
                      const footTdR = { ...tdR, ...fw };
                      return (
                        <>
                          <tr style={fw}>
                            <td style={{ ...footTd, borderTop: '2px solid var(--border)' }} rowSpan={5}>Store Total</td>
                            <td style={{ ...footTd, color: '#1d4ed8', paddingLeft: 10, borderTop: '2px solid var(--border)' }}>GSV</td>
                            {visibleMonths.map(mk => <td key={mk} style={{ ...footTdR, borderTop: '2px solid var(--border)' }}>{fmtRs(monthlyBreakdown.monthTotals[mk].gsv)}</td>)}
                            <td style={{ ...footTdR, color: '#1d4ed8', borderTop: '2px solid var(--border)' }}>{fmtRs(storeGsv)}</td>
                          </tr>
                          <tr style={fw}>
                            <td style={{ ...footTd, color: '#059669', paddingLeft: 10 }}>Bills</td>
                            {visibleMonths.map(mk => <td key={mk} style={{ ...footTdR, color: '#059669' }}>{monthlyBreakdown.monthTotals[mk].bills.size}</td>)}
                            <td style={{ ...footTdR, color: '#059669' }}>{storeBills}</td>
                          </tr>
                          <tr style={fw}>
                            <td style={{ ...footTd, paddingLeft: 10 }}>AVPT</td>
                            {visibleMonths.map(mk => {
                              const mt = monthlyBreakdown.monthTotals[mk];
                              const avpt = mt.bills.size ? Math.round(mt.gsv / mt.bills.size) : 0;
                              return <td key={mk} style={{ ...footTdR, color: avpt >= 3000 ? 'var(--green)' : avpt >= 2000 ? '#d97706' : 'var(--red)' }}>{fmtRs(avpt)}</td>;
                            })}
                            <td style={{ ...footTdR, color: storeAvpt >= 3000 ? 'var(--green)' : storeAvpt >= 2000 ? '#d97706' : 'var(--red)' }}>{storeAvpt ? fmtRs(storeAvpt) : '—'}</td>
                          </tr>
                          <tr style={fw}>
                            <td style={{ ...footTd, paddingLeft: 10 }}>AUPT</td>
                            {visibleMonths.map(mk => {
                              const mt = monthlyBreakdown.monthTotals[mk];
                              const q = salesRows.filter(r => r.MonthKey === mk).reduce((s,r)=>s+r.Quantity,0);
                              const aupt = mt.bills.size ? Math.round((q / mt.bills.size) * 100) / 100 : 0;
                              return <td key={mk} style={{ ...footTdR, color: aupt >= 4 ? 'var(--green)' : aupt >= 3 ? '#d97706' : 'var(--red)' }}>{aupt.toFixed(2)}</td>;
                            })}
                            <td style={{ ...footTdR, color: storeAupt >= 4 ? 'var(--green)' : storeAupt >= 3 ? '#d97706' : 'var(--red)' }}>{storeAupt ? storeAupt.toFixed(2) : '—'}</td>
                          </tr>
                          <tr style={fw}>
                            <td style={{ ...footTd, paddingLeft: 10 }}>≤2 Qty%</td>
                            {visibleMonths.map(mk => {
                              const mt = monthlyBreakdown.monthTotals[mk];
                              const single = monthlyBreakdown.staffList.reduce((ss, name) => {
                                const cell = monthlyBreakdown.grid[name]?.[mk];
                                if (!cell) return ss;
                                return ss + [...cell.invQty.values()].filter(q => q <= 2).length;
                              }, 0);
                              const pct = mt.bills.size ? (single / mt.bills.size) * 100 : 0;
                              return <td key={mk} style={{ ...footTdR, color: pct > 40 ? 'var(--red)' : pct > 25 ? '#d97706' : 'var(--green)' }}>{pct.toFixed(0)}%</td>;
                            })}
                            <td style={{ ...footTdR, color: storeSinglePct > 40 ? 'var(--red)' : storeSinglePct > 25 ? '#d97706' : 'var(--green)' }}>{storeSinglePct.toFixed(1)}%</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
            );
          })()}

        </>
      )}

      {/* ── Tab 6: DSR ── */}
      {activeTab === 6 && (() => {
        const monthKey = selMonth === 'All' ? (() => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; })() : selMonth;
        const [mY, mMo] = monthKey.split('-').map(Number);
        const totalDaysInMonth = new Date(mY, mMo, 0).getDate();
        const monthlyTarget = dsrMonthlyTarget[monthKey] || 0;

        const dsrDays: {dateKey:string;date:Date;day:string;sale:number;bills:number;qty:number}[] = [];
        if (rows.length > 0) {
          const DNAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const tRows = selMonth==='All' ? salesRows : salesRows.filter(r=>r.MonthKey===selMonth);
          const dm = new Map<string,{date:Date;sale:number;bills:Set<string>;qty:number}>();
          for (const r of tRows) {
            const k=r.BillDate.toISOString().slice(0,10);
            if(!dm.has(k)) dm.set(k,{date:r.BillDate,sale:0,bills:new Set(),qty:0});
            const d=dm.get(k)!; d.sale+=r.GSV; d.bills.add(r.InvoiceNumber); d.qty+=r.Quantity;
          }
          // Fill all days of the month, not just days with sales
          for (let d=1; d<=totalDaysInMonth; d++) {
            const date = new Date(mY, mMo-1, d);
            const k = date.toISOString().slice(0,10);
            const v = dm.get(k);
            dsrDays.push({dateKey:k,date,day:DNAMES[date.getDay()],sale:v?.sale||0,bills:v?.bills.size||0,qty:v?.qty||0});
          }
        }

        // Rolling target logic: each day's target = (remaining target) / (remaining days)
        const today = new Date(); today.setHours(0,0,0,0);
        let cumulativeSale = 0;
        const dayTargets: Record<string, number> = {};
        if (monthlyTarget > 0 && dsrDays.length > 0) {
          for (let i = 0; i < dsrDays.length; i++) {
            const remaining = monthlyTarget - cumulativeSale;
            const remainingDays = totalDaysInMonth - i;
            dayTargets[dsrDays[i].dateKey] = Math.round(remaining / remainingDays);
            cumulativeSale += dsrDays[i].sale;
          }
        }

        const mtdSale = dsrDays.reduce((s,d)=>s+d.sale,0);
        const mtdBills = dsrDays.reduce((s,d)=>s+d.bills,0);
        const mtdQty = dsrDays.reduce((s,d)=>s+d.qty,0);
        const mtdTarget = Object.values(dayTargets).reduce((s,v)=>s+v,0);
        const inp: React.CSSProperties={width:80,padding:'3px 6px',fontSize:12,borderRadius:4,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text1)'};

        return (
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,flexWrap:'wrap',gap:8}}>
              <div style={{fontWeight:700,fontSize:15}}>📊 Daily Sales Report — {!rows.length?'Upload ASR CSV first':selMonth==='All'?'Select a month above':activeLabel}</div>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                {monthlyTarget > 0 ? (
                  <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(29,78,216,0.08)',borderRadius:8,padding:'6px 12px',fontSize:13}}>
                    <span style={{color:'var(--text2)'}}>Monthly Target:</span>
                    <strong style={{color:'var(--brand)'}}>{monthlyTarget.toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0})}</strong>
                    <button onClick={()=>{setDsrMtInput(String(monthlyTarget));}} className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'2px 6px'}}>✎</button>
                    <span style={{color:'var(--text2)',fontSize:11}}>|</span>
                    <span style={{fontSize:12,color:mtdSale>=mtdTarget*0.5?'var(--green)':'var(--red)'}}>Achieved: {mtdSale.toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0})} ({monthlyTarget?(mtdSale/monthlyTarget*100).toFixed(0):0}%)</span>
                  </div>
                ) : (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:12,color:'var(--text2)',fontWeight:600}}>Set Monthly Target:</span>
                    <input type="number" placeholder="e.g. 1500000" value={dsrMtInput}
                      onChange={e=>setDsrMtInput(e.target.value)}
                      style={{width:140,padding:'5px 8px',fontSize:12,borderRadius:6,border:'2px solid var(--brand)',background:'var(--bg2)',color:'var(--text1)'}}
                      onKeyDown={e=>{if(e.key==='Enter'&&dsrMtInput){saveDsrMonthlyTarget({...dsrMonthlyTarget,[monthKey]:+dsrMtInput});setDsrMtInput('');}}}/>
                    <button disabled={!dsrMtInput} onClick={()=>{saveDsrMonthlyTarget({...dsrMonthlyTarget,[monthKey]:+dsrMtInput});setDsrMtInput('');}} className="btn btn-brand btn-sm">Set</button>
                  </div>
                )}
                {dsrMtInput && monthlyTarget > 0 && (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <input type="number" value={dsrMtInput} onChange={e=>setDsrMtInput(e.target.value)}
                      style={{width:120,padding:'5px 8px',fontSize:12,borderRadius:6,border:'2px solid var(--brand)',background:'var(--bg2)',color:'var(--text1)'}}/>
                    <button onClick={()=>{saveDsrMonthlyTarget({...dsrMonthlyTarget,[monthKey]:+dsrMtInput});setDsrMtInput('');}} className="btn btn-brand btn-sm">Update</button>
                    <button onClick={()=>setDsrMtInput('')} className="btn btn-ghost btn-sm">✕</button>
                  </div>
                )}
              </div>
            </div>
            {!rows.length ? (
              <div style={{padding:32,textAlign:'center',color:'var(--text2)',fontSize:13}}>Upload Article Sale Report CSV to auto-fill daily sales.</div>
            ) : selMonth==='All' ? (
              <div style={{padding:16,color:'var(--text2)',fontSize:13}}>Select a month from the month filter to view DSR.</div>
            ) : (
              <>
                {monthlyTarget > 0 && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
                    {[
                      {label:'Monthly Target',value:monthlyTarget.toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}),color:'#1d4ed8'},
                      {label:'MTD Sale',value:mtdSale.toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}),color:mtdSale>=mtdTarget*0.9?'#059669':'#dc2626'},
                      {label:'Backlog',value:(monthlyTarget-mtdSale).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}),color:(monthlyTarget-mtdSale)<=0?'#059669':'#dc2626'},
                      {label:'Ach%',value:`${(mtdSale/monthlyTarget*100).toFixed(1)}%`,color:mtdSale/monthlyTarget>=1?'#059669':mtdSale/monthlyTarget>=0.8?'#d97706':'#dc2626'},
                    ].map(({label,value,color})=>(
                      <div key={label} style={{padding:'8px 12px',borderRadius:8,background:'var(--bg1)',border:'1px solid var(--border)'}}>
                        <div style={{fontSize:10,color:'var(--text2)',fontWeight:600,marginBottom:2}}>{label}</div>
                        <div style={{fontSize:15,fontWeight:700,color}}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="tbl-wrap">
                  <table>
                    <thead><tr>{['Date','Day','Target','Sale','%Ach','Walking','Bills','Qty','Con%','AUPT','AVPT','LY Sale','GOLY','Scrap','CMP',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {dsrDays.map(d=>{
                        const m=dsrManual[d.dateKey]||{} as DsrManualEntry;
                        const dayTarget = dayTargets[d.dateKey] || 0;
                        const walking=m.walking||0, lySale=m.lySale||0;
                        const pctAch=dayTarget&&d.sale?(d.sale/dayTarget)*100:null;
                        const con=walking?(d.bills/walking)*100:null;
                        const aupt=d.bills?d.qty/d.bills:0;
                        const avpt=d.bills?d.sale/d.bills:0;
                        const goly=lySale?((d.sale/lySale)-1)*100:null;
                        const isEd=dsrEditing===d.dateKey;
                        const isFuture = d.date > today;
                        return (
                          <tr key={d.dateKey} style={{background:isEd?'rgba(29,78,216,0.06)':isFuture?'rgba(0,0,0,0.02)':undefined,opacity:isFuture?0.6:1}}>
                            <td style={{...td,fontWeight:600}}>{fmtDate(d.date)}</td>
                            <td style={{...td,color:'var(--text2)'}}>{d.day}</td>
                            <td style={{...tdR,color:'var(--text2)',fontStyle:isFuture?'italic':undefined}}>{dayTarget?dayTarget.toLocaleString('en-IN'):<span style={{color:'var(--text2)'}}>—</span>}</td>
                            {isEd?(<>
                              <td style={tdR}>{d.sale>0?`₹${d.sale.toLocaleString('en-IN',{maximumFractionDigits:0})}`:'—'}</td><td style={tdR}>—</td>
                              <td style={td}><input type="number" style={inp} value={dsrEdit.walking??m.walking??''} onChange={e=>setDsrEdit(p=>({...p,walking:+e.target.value}))}/></td>
                              <td style={tdR}>{d.bills||'—'}</td><td style={tdR}>{d.qty||'—'}</td>
                              <td style={tdR}>—</td><td style={tdR}>—</td><td style={tdR}>—</td>
                              <td style={td}><input type="number" style={inp} value={dsrEdit.lySale??m.lySale??''} onChange={e=>setDsrEdit(p=>({...p,lySale:+e.target.value}))}/></td>
                              <td style={tdR}>—</td>
                              <td style={td}><input type="number" style={inp} value={dsrEdit.scrap??m.scrap??''} onChange={e=>setDsrEdit(p=>({...p,scrap:+e.target.value}))}/></td>
                              <td style={td}><input type="number" style={inp} value={dsrEdit.cmp??m.cmp??''} onChange={e=>setDsrEdit(p=>({...p,cmp:+e.target.value}))}/></td>
                              <td style={td}>
                                <button type="button" onClick={()=>{saveDsrManual({...dsrManual,[d.dateKey]:{...m,...dsrEdit}as DsrManualEntry});setDsrEditing(null);setDsrEdit({});}} className="btn btn-brand btn-sm" style={{fontSize:11,marginRight:4}}>Save</button>
                                <button type="button" onClick={()=>{setDsrEditing(null);setDsrEdit({});}} className="btn btn-ghost btn-sm" style={{fontSize:11}}>✕</button>
                              </td>
                            </>):(<>
                              <td style={{...tdR,color:pctAch==null?'var(--text2)':d.sale===0?'var(--text2)':pctAch>=100?'var(--green)':pctAch>=80?'#d97706':'var(--red)',fontWeight:d.sale>0?600:400}}>{d.sale>0?`₹${d.sale.toLocaleString('en-IN',{maximumFractionDigits:0})}`:<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={{...tdR,color:pctAch==null?'var(--text2)':pctAch>=100?'var(--green)':pctAch>=80?'#d97706':'var(--red)'}}>{pctAch!=null?`${pctAch.toFixed(0)}%`:'—'}</td>
                              <td style={tdR}>{walking||<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={tdR}>{d.bills||<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={tdR}>{d.qty||<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={tdR}>{con!=null?`${con.toFixed(0)}%`:'—'}</td>
                              <td style={tdR}>{d.bills?aupt.toFixed(2):'—'}</td>
                              <td style={tdR}>{d.bills?`₹${avpt.toLocaleString('en-IN',{maximumFractionDigits:0})}`:'—'}</td>
                              <td style={tdR}>{lySale?`₹${lySale.toLocaleString('en-IN',{maximumFractionDigits:0})}`:<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={{...tdR,color:goly==null?'var(--text2)':goly>=0?'var(--green)':'var(--red)'}}>{goly!=null?`${goly>=0?'+':''}${goly.toFixed(0)}%`:'—'}</td>
                              <td style={tdR}>{m.scrap||<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={tdR}>{m.cmp||<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={td}>{!isFuture&&<button type="button" onClick={(e)=>{e.stopPropagation();setDsrEditing(d.dateKey);setDsrEdit({});}} className="btn btn-ghost btn-sm" style={{fontSize:11,minWidth:44,color:'var(--brand)'}}>Edit</button>}</td>
                            </>)}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:'var(--bg2)',fontWeight:700}}>
                        <td style={td} colSpan={2}>MTD</td>
                        <td style={tdR}>{monthlyTarget?monthlyTarget.toLocaleString('en-IN'):'—'}</td>
                        <td style={tdR}>{mtdSale>0?`₹${mtdSale.toLocaleString('en-IN',{maximumFractionDigits:0})}`:'—'}</td>
                        <td style={{...tdR,color:monthlyTarget?(mtdSale/monthlyTarget*100>=100?'var(--green)':mtdSale/monthlyTarget*100>=80?'#d97706':'var(--red)'):'var(--text2)'}}>{monthlyTarget?`${(mtdSale/monthlyTarget*100).toFixed(0)}%`:'—'}</td>
                        <td style={tdR}>—</td>
                        <td style={tdR}>{mtdBills||'—'}</td><td style={tdR}>{mtdQty||'—'}</td>
                        <td style={tdR}>—</td>
                        <td style={tdR}>{mtdBills?(mtdQty/mtdBills).toFixed(2):'—'}</td>
                        <td style={tdR}>{mtdBills?`₹${(mtdSale/mtdBills).toLocaleString('en-IN',{maximumFractionDigits:0})}`:'—'}</td>
                        <td style={tdR}>—</td><td style={tdR}>—</td>
                        <td style={tdR}>{dsrDays.reduce((s,d)=>s+(dsrManual[d.dateKey]?.scrap||0),0)||'—'}</td>
                        <td style={tdR}>{dsrDays.reduce((s,d)=>s+(dsrManual[d.dateKey]?.cmp||0),0)||'—'}</td>
                        <td style={td}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Tab 7: Category Wise ── */}
      {activeTab === 7 && (() => {
        const cats=Array.from(new Set(salesRows.map(r=>r.Category).filter(Boolean))).sort();
        const fRows=selMonth==='All'?salesRows:salesRows.filter(r=>r.MonthKey===selMonth);
        const totalTy=fRows.reduce((s,r)=>s+r.GSV,0);
        const catData=cats.map(cat=>{
          const rs=fRows.filter(r=>r.Category===cat);
          const saleTy=rs.reduce((s,r)=>s+r.GSV,0), qtyTy=rs.reduce((s,r)=>s+r.Quantity,0);
          const man=catTargets[cat]||{saleLy:0,qtyLy:0,target:0};
          const saleGap=saleTy-man.saleLy, qtyGap=qtyTy-man.qtyLy;
          const l2l=man.saleLy?((saleTy-man.saleLy)/man.saleLy*100):null;
          const contrib=totalTy?(saleTy/totalTy*100):0;
          const achPct=man.target?(saleTy/man.target*100):null;
          return {cat,saleTy,qtyTy,man,saleGap,qtyGap,l2l,contrib,achPct};
        });
        const inp: React.CSSProperties={width:90,padding:'3px 6px',fontSize:12,borderRadius:4,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text1)'};
        return (
          <div style={card}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>📋 Category Wise Sale — {!rows.length?'Upload ASR first':activeLabel}</div>
            {!rows.length?(
              <div style={{padding:32,textAlign:'center',color:'var(--text2)',fontSize:13}}>Upload Article Sale Report CSV to view category data.</div>
            ):(
              <div className="tbl-wrap">
                <table>
                  <thead><tr>{['Category','Sale TY','Qty TY','Sale LY ✎','Qty LY ✎','Sale Gap','Qty Gap','L2L%','Contrib%','Target ✎','Ach%',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {catData.map(({cat,saleTy,qtyTy,man,saleGap,qtyGap,l2l,contrib,achPct})=>{
                      const isEd=catEditing===cat;
                      const ev=catEditVals[cat]||man;
                      return (
                        <tr key={cat} style={{background:isEd?'rgba(29,78,216,0.10)':undefined,outline:isEd?'2px solid var(--brand)':undefined,outlineOffset:'-1px'}}>
                          <td style={{...td,fontWeight:600}}>{cat}</td>
                          <td style={tdR}>{fmtRs(saleTy)}</td><td style={tdR}>{qtyTy}</td>
                          {isEd?(<>
                            <td style={td}><input type="number" style={inp} value={ev.saleLy||''} onChange={e=>setCatEditVals(p=>({...p,[cat]:{...ev,saleLy:+e.target.value}}))}/></td>
                            <td style={td}><input type="number" style={inp} value={ev.qtyLy||''} onChange={e=>setCatEditVals(p=>({...p,[cat]:{...ev,qtyLy:+e.target.value}}))}/></td>
                            <td style={tdR}>—</td><td style={tdR}>—</td><td style={tdR}>—</td>
                            <td style={tdR}>{contrib.toFixed(1)}%</td>
                            <td style={td}><input type="number" style={inp} value={ev.target||''} onChange={e=>setCatEditVals(p=>({...p,[cat]:{...ev,target:+e.target.value}}))}/></td>
                            <td style={tdR}>—</td>
                            <td style={td}>
                              <button type="button" onClick={()=>{saveCatTargets({...catTargets,[cat]:catEditVals[cat]||man});setCatEditing(null);}} className="btn btn-brand btn-sm" style={{fontSize:11,marginRight:4}}>Save</button>
                              <button type="button" onClick={()=>setCatEditing(null)} className="btn btn-ghost btn-sm" style={{fontSize:11}}>✕</button>
                            </td>
                          </>):(<>
                            <td style={tdR}>{man.saleLy?fmtRs(man.saleLy):<span style={{color:'var(--text2)'}}>—</span>}</td>
                            <td style={tdR}>{man.qtyLy||<span style={{color:'var(--text2)'}}>—</span>}</td>
                            <td style={{...tdR,color:saleGap>=0?'var(--green)':'var(--red)'}}>{man.saleLy?fmtRs(saleGap):'—'}</td>
                            <td style={{...tdR,color:qtyGap>=0?'var(--green)':'var(--red)'}}>{man.qtyLy?(qtyGap>=0?'+':'')+qtyGap:'—'}</td>
                            <td style={{...tdR,color:l2l==null?'var(--text2)':l2l>=0?'var(--green)':'var(--red)'}}>{l2l!=null?`${l2l>=0?'+':''}${l2l.toFixed(1)}%`:'—'}</td>
                            <td style={tdR}>{contrib.toFixed(1)}%</td>
                            <td style={tdR}>{man.target?man.target.toLocaleString('en-IN'):<span style={{color:'var(--text2)'}}>—</span>}</td>
                            <td style={{...tdR,color:achPct==null?'var(--text2)':achPct>=100?'var(--green)':achPct>=80?'#d97706':'var(--red)'}}>{achPct!=null?`${achPct.toFixed(0)}%`:'—'}</td>
                            <td style={td}><button type="button" onClick={(e)=>{e.stopPropagation();setCatEditing(cat);setCatEditVals(p=>({...p,[cat]:{...man}}));}} className="btn btn-ghost btn-sm" style={{fontSize:11,minWidth:44,color:'var(--brand)'}}>Edit</button></td>
                          </>)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'var(--bg2)',fontWeight:700}}>
                      <td style={td}>Total</td>
                      <td style={tdR}>{fmtRs(catData.reduce((s,c)=>s+c.saleTy,0))}</td>
                      <td style={tdR}>{catData.reduce((s,c)=>s+c.qtyTy,0)}</td>
                      <td style={tdR}>{catData.some(c=>c.man.saleLy)?fmtRs(catData.reduce((s,c)=>s+c.man.saleLy,0)):'—'}</td>
                      <td style={tdR}>{catData.some(c=>c.man.qtyLy)?catData.reduce((s,c)=>s+c.man.qtyLy,0):'—'}</td>
                      <td colSpan={4} style={td}></td>
                      <td style={tdR}>{catData.some(c=>c.man.target)?catData.reduce((s,c)=>s+c.man.target,0).toLocaleString('en-IN'):'—'}</td>
                      <td colSpan={2} style={td}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab 8: Staff Wise ── */}
      {activeTab === 8 && (() => {
        const staffMonths=Array.from(new Set(salesRows.map(r=>r.MonthKey))).sort();
        const fRows=staffSelMonth==='All'?salesRows:salesRows.filter(r=>r.MonthKey===staffSelMonth);
        const stData=buildStaffStats(fRows).map(s=>{
          const man=staffTargets[s.name]||{target:0,lySale:0};
          const achPct=man.target?(s.gsv/man.target*100):null;
          const backlog=man.target?s.gsv-man.target:null;
          const goly=man.lySale?((s.gsv/man.lySale)-1)*100:null;
          return {...s,man,achPct,backlog,goly};
        });
        const inp: React.CSSProperties={width:90,padding:'3px 6px',fontSize:12,borderRadius:4,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text1)'};
        const swLabel=staffSelMonth==='All'?'All Months':monthLabel(staffSelMonth);

        // ── Multi-month matrix data ──
        // grid[staffName][monthKey] = {gsv, bills, qty}
        const allStaff=Array.from(new Set(salesRows.map(r=>r.SalesPerson))).filter(Boolean).sort();
        type MCell={gsv:number;bills:Set<string>;qty:number};
        const grid:Record<string,Record<string,MCell>>={};
        for(const sp of allStaff) grid[sp]={};
        for(const r of salesRows){
          if(!grid[r.SalesPerson]) grid[r.SalesPerson]={};
          if(!grid[r.SalesPerson][r.MonthKey]) grid[r.SalesPerson][r.MonthKey]={gsv:0,bills:new Set(),qty:0};
          grid[r.SalesPerson][r.MonthKey].gsv+=r.GSV;
          grid[r.SalesPerson][r.MonthKey].bills.add(r.InvoiceNumber);
          grid[r.SalesPerson][r.MonthKey].qty+=r.Quantity;
        }
        const monthTotals:Record<string,{gsv:number;bills:Set<string>;qty:number}>={};
        for(const mk of staffMonths){
          monthTotals[mk]={gsv:0,bills:new Set(),qty:0};
          for(const sp of allStaff){
            const c=grid[sp]?.[mk];
            if(c){monthTotals[mk].gsv+=c.gsv;c.bills.forEach(b=>monthTotals[mk].bills.add(b));monthTotals[mk].qty+=c.qty;}
          }
        }

        return (
          <div style={card}>
            {/* ── Header row ── */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:15}}>👥 Staff Wise Performance{staffViewMode==='single'?` — ${!rows.length?'Upload ASR first':swLabel}`:staffViewMode==='multi'?' — Multi-Month Matrix':' — Staff Drill Down'}</div>
              {rows.length>0&&(
                <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                  <button onClick={()=>setStaffViewMode('single')} className={`btn btn-sm ${staffViewMode==='single'?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>📋 Single Month</button>
                  <button onClick={()=>setStaffViewMode('multi')} className={`btn btn-sm ${staffViewMode==='multi'?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>📅 All Months</button>
                  <button onClick={()=>setStaffViewMode('drill')} className={`btn btn-sm ${staffViewMode==='drill'?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>🔍 Staff Drill Down</button>
                </div>
              )}
            </div>

            {!rows.length?(
              <div style={{padding:32,textAlign:'center',color:'var(--text2)',fontSize:13}}>Upload Article Sale Report CSV to view staff data.</div>
            ):staffViewMode==='drill'?(
              /* ── Staff Drill Down: pick a staff, see Category × Month pivot ── */
              (() => {
                const allStaffList=Array.from(new Set(salesRows.map(r=>r.SalesPerson))).filter(Boolean).sort();
                const drillRows=staffDrillStaff?salesRows.filter(r=>r.SalesPerson===staffDrillStaff):[];
                const drillMonths=Array.from(new Set(drillRows.map(r=>r.MonthKey))).sort();
                // pivot: category → month → {gsv, bills, qty}
                type DC={gsv:number;bills:Set<string>;qty:number};
                const pivot:Record<string,Record<string,DC>>={};
                for(const r of drillRows){
                  if(!pivot[r.Category]) pivot[r.Category]={};
                  if(!pivot[r.Category][r.MonthKey]) pivot[r.Category][r.MonthKey]={gsv:0,bills:new Set(),qty:0};
                  pivot[r.Category][r.MonthKey].gsv+=r.GSV;
                  pivot[r.Category][r.MonthKey].bills.add(r.InvoiceNumber);
                  pivot[r.Category][r.MonthKey].qty+=r.Quantity;
                }
                const drillCats=Object.keys(pivot).sort();
                // category totals
                const catTotals:Record<string,{gsv:number;bills:Set<string>;qty:number}>={};
                for(const cat of drillCats){
                  catTotals[cat]={gsv:0,bills:new Set(),qty:0};
                  for(const mk of drillMonths){const c=pivot[cat]?.[mk];if(c){catTotals[cat].gsv+=c.gsv;c.bills.forEach(b=>catTotals[cat].bills.add(b));catTotals[cat].qty+=c.qty;}}
                }
                // month totals
                const mTotals:Record<string,{gsv:number;bills:Set<string>;qty:number}>={};
                for(const mk of drillMonths){
                  mTotals[mk]={gsv:0,bills:new Set(),qty:0};
                  for(const cat of drillCats){const c=pivot[cat]?.[mk];if(c){mTotals[mk].gsv+=c.gsv;c.bills.forEach(b=>mTotals[mk].bills.add(b));mTotals[mk].qty+=c.qty;}}
                }
                const grandTotal={gsv:drillRows.reduce((s,r)=>s+r.GSV,0),bills:new Set(drillRows.map(r=>r.InvoiceNumber)),qty:drillRows.reduce((s,r)=>s+r.Quantity,0)};
                return (
                  <div>
                    {/* Staff selector */}
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--text2)'}}>Select Staff:</span>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        {allStaffList.map(sp=>(
                          <button key={sp} onClick={()=>setStaffDrillStaff(staffDrillStaff===sp?'':sp)}
                            className={`btn btn-sm ${staffDrillStaff===sp?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>{sp}</button>
                        ))}
                      </div>
                    </div>
                    {!staffDrillStaff?(
                      <div style={{padding:32,textAlign:'center',color:'var(--text2)',fontSize:13}}>Select a staff member above to see their Category × Month breakdown.</div>
                    ):drillCats.length===0?(
                      <div style={{padding:32,textAlign:'center',color:'var(--text2)',fontSize:13}}>No sales data found for {staffDrillStaff}.</div>
                    ):(
                      <div className="tbl-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th style={{...th,position:'sticky',left:0,background:'var(--bg1)',zIndex:2,minWidth:140}}>Category</th>
                              {drillMonths.map(mk=><th key={mk} style={{...th,minWidth:110,textAlign:'right'}}>{monthLabel(mk)}</th>)}
                              <th style={{...th,minWidth:110,textAlign:'right',borderLeft:'2px solid var(--border)'}}>Total</th>
                            </tr>
                            <tr>
                              <td style={{...td,position:'sticky',left:0,background:'var(--bg1)',zIndex:2,fontSize:10,color:'var(--text2)',fontStyle:'italic'}}>₹ sale · bills · qty</td>
                              {drillMonths.map(mk=><td key={mk} style={{...tdR,fontSize:10,color:'var(--text2)',fontStyle:'italic'}}>₹ sale · bills · qty</td>)}
                              <td style={{...tdR,fontSize:10,color:'var(--text2)',fontStyle:'italic',borderLeft:'2px solid var(--border)'}}>₹ sale · bills · qty</td>
                            </tr>
                          </thead>
                          <tbody>
                            {drillCats.map(cat=>(
                              <tr key={cat}>
                                <td style={{...td,fontWeight:600,position:'sticky',left:0,background:'var(--bg1)',zIndex:1}}>{cat}</td>
                                {drillMonths.map(mk=>{
                                  const c=pivot[cat]?.[mk];
                                  return (
                                    <td key={mk} style={{...tdR,background:c&&c.gsv>0?'rgba(29,78,216,0.04)':undefined}}>
                                      {c&&c.gsv>0?(
                                        <>
                                          <div style={{fontWeight:600,fontSize:12}}>{fmtRs(c.gsv)}</div>
                                          <div style={{fontSize:10,color:'var(--text2)',marginTop:1}}>{c.bills.size} bills · {c.qty} qty</div>
                                        </>
                                      ):<span style={{color:'var(--text2)',fontSize:12}}>—</span>}
                                    </td>
                                  );
                                })}
                                <td style={{...tdR,borderLeft:'2px solid var(--border)',background:'rgba(29,78,216,0.07)'}}>
                                  <div style={{fontWeight:700,fontSize:12}}>{fmtRs(catTotals[cat].gsv)}</div>
                                  <div style={{fontSize:10,color:'var(--text2)',marginTop:1}}>{catTotals[cat].bills.size} bills · {catTotals[cat].qty} qty</div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{background:'var(--bg2)',fontWeight:700}}>
                              <td style={{...td,position:'sticky',left:0,background:'var(--bg2)',zIndex:1}}>{staffDrillStaff} Total</td>
                              {drillMonths.map(mk=>(
                                <td key={mk} style={tdR}>
                                  <div style={{fontSize:12}}>{fmtRs(mTotals[mk].gsv)}</div>
                                  <div style={{fontSize:10,color:'var(--text2)',fontWeight:400,marginTop:1}}>{mTotals[mk].bills.size} bills · {mTotals[mk].qty} qty</div>
                                </td>
                              ))}
                              <td style={{...tdR,borderLeft:'2px solid var(--border)'}}>
                                <div style={{fontSize:12}}>{fmtRs(grandTotal.gsv)}</div>
                                <div style={{fontSize:10,color:'var(--text2)',fontWeight:400,marginTop:1}}>{grandTotal.bills.size} bills · {grandTotal.qty} qty</div>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()
            ):staffViewMode==='single'?(
              <>
                {/* Single-month selector */}
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                  <button onClick={()=>setStaffSelMonth('All')} className={`btn btn-sm ${staffSelMonth==='All'?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>All</button>
                  {staffMonths.map(mk=>(
                    <button key={mk} onClick={()=>setStaffSelMonth(staffSelMonth===mk?'All':mk)} className={`btn btn-sm ${staffSelMonth===mk?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>{monthLabel(mk)}</button>
                  ))}
                </div>
                <div className="tbl-wrap">
                  <table>
                    <thead><tr>{['Staff','Target ✎','Sale','Ach%','Backlog','Bills','Qty','AUPT','AVPT','LY Sale ✎','GOLY',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stData.map(s=>{
                        const isEd=staffEditing===s.name;
                        const ev=staffEditVals[s.name]||s.man;
                        return (
                          <tr key={s.name} style={{background:isEd?'rgba(29,78,216,0.10)':undefined}}>
                            <td style={{...td,fontWeight:600}}>{s.name}</td>
                            {isEd?(<>
                              <td style={td}><input type="number" style={inp} value={ev.target||''} onChange={e=>setStaffEditVals(p=>({...p,[s.name]:{...ev,target:+e.target.value}}))}/></td>
                              <td style={tdR}>{fmtRs(s.gsv)}</td>
                              <td style={tdR}>—</td><td style={tdR}>—</td>
                              <td style={tdR}>{s.bills}</td><td style={tdR}>{s.qty}</td>
                              <td style={tdR}>{s.aupt.toFixed(2)}</td><td style={tdR}>{fmtRs(s.avpt)}</td>
                              <td style={td}><input type="number" style={inp} value={ev.lySale||''} onChange={e=>setStaffEditVals(p=>({...p,[s.name]:{...ev,lySale:+e.target.value}}))}/></td>
                              <td style={tdR}>—</td>
                              <td style={td}>
                                <button type="button" onClick={()=>{saveStaffTargets({...staffTargets,[s.name]:staffEditVals[s.name]||s.man});setStaffEditing(null);}} className="btn btn-brand btn-sm" style={{fontSize:11,marginRight:4}}>Save</button>
                                <button type="button" onClick={()=>setStaffEditing(null)} className="btn btn-ghost btn-sm" style={{fontSize:11}}>✕</button>
                              </td>
                            </>):(<>
                              <td style={tdR}>{s.man.target?s.man.target.toLocaleString('en-IN'):<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={tdR}>{fmtRs(s.gsv)}</td>
                              <td style={{...tdR,color:s.achPct==null?'var(--text2)':s.achPct>=100?'var(--green)':s.achPct>=80?'#d97706':'var(--red)'}}>{s.achPct!=null?`${s.achPct.toFixed(0)}%`:'—'}</td>
                              <td style={{...tdR,color:s.backlog==null?'var(--text2)':s.backlog>=0?'var(--green)':'var(--red)'}}>{s.backlog!=null?(s.backlog>=0?'+':'-')+fmtRs(Math.abs(s.backlog)):'—'}</td>
                              <td style={tdR}>{s.bills}</td><td style={tdR}>{s.qty}</td>
                              <td style={{...tdR,color:s.aupt>=4?'var(--green)':'var(--text1)'}}>{s.aupt.toFixed(2)}</td>
                              <td style={tdR}>{fmtRs(s.avpt)}</td>
                              <td style={tdR}>{s.man.lySale?fmtRs(s.man.lySale):<span style={{color:'var(--text2)'}}>—</span>}</td>
                              <td style={{...tdR,color:s.goly==null?'var(--text2)':s.goly>=0?'var(--green)':'var(--red)'}}>{s.goly!=null?`${s.goly>=0?'+':''}${s.goly.toFixed(0)}%`:'—'}</td>
                              <td style={td}><button type="button" onClick={(e)=>{e.stopPropagation();setStaffEditing(s.name);setStaffEditVals(p=>({...p,[s.name]:{...s.man}}));}} className="btn btn-ghost btn-sm" style={{fontSize:11,minWidth:44,color:'var(--brand)'}}>Edit</button></td>
                            </>)}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:'var(--bg2)',fontWeight:700}}>
                        <td style={td}>Store Total</td>
                        <td style={tdR}>{Object.values(staffTargets).some(v=>v.target)?Object.values(staffTargets).reduce((s,v)=>s+(v.target||0),0).toLocaleString('en-IN'):'—'}</td>
                        <td style={tdR}>{fmtRs(stData.reduce((s,x)=>s+x.gsv,0))}</td>
                        <td colSpan={2} style={td}></td>
                        <td style={tdR}>{stData.reduce((s,x)=>s+x.bills,0)}</td>
                        <td style={tdR}>{stData.reduce((s,x)=>s+x.qty,0)}</td>
                        <td colSpan={5} style={td}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ):(
              /* ── All Months: staff selector + month-wise detail ── */
              <div>
                {/* Staff filter */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                  <span style={{fontSize:12,fontWeight:600,color:'var(--text2)'}}>Staff:</span>
                  {allStaff.map(sp=>(
                    <button key={sp} onClick={()=>setStaffDrillStaff(staffDrillStaff===sp?'':sp)}
                      className={`btn btn-sm ${staffDrillStaff===sp?'btn-brand':'btn-ghost'}`} style={{fontSize:12}}>{sp}</button>
                  ))}
                </div>
                {!staffDrillStaff?(
                  <div style={{padding:32,textAlign:'center',color:'var(--text2)',fontSize:13}}>
                    👆 Select a staff member above to see their month-wise performance.
                  </div>
                ):(()=>{
                  const spRows=salesRows.filter(r=>r.SalesPerson===staffDrillStaff);
                  const spMonths=Array.from(new Set(spRows.map(r=>r.MonthKey))).sort();
                  const mStats=spMonths.map(mk=>{
                    const mr=spRows.filter(r=>r.MonthKey===mk);
                    const billSet=new Set(mr.map(r=>r.InvoiceNumber));
                    const gsv=mr.reduce((s,r)=>s+r.GSV,0);
                    const qty=mr.reduce((s,r)=>s+r.Quantity,0);
                    return {mk,gsv,bills:billSet.size,qty,aupt:billSet.size?qty/billSet.size:0,avpt:billSet.size?gsv/billSet.size:0};
                  });
                  const withMoM=mStats.map((m,i)=>({...m,mom:i===0||!mStats[i-1].gsv?null:((m.gsv/mStats[i-1].gsv)-1)*100}));
                  const totalBillSet=new Set(spRows.map(r=>r.InvoiceNumber));
                  const totGsv=spRows.reduce((s,r)=>s+r.GSV,0);
                  const totQty=spRows.reduce((s,r)=>s+r.Quantity,0);
                  const totBills=totalBillSet.size;
                  // LY sale from stored targets
                  const lySale=staffTargets[staffDrillStaff]?.lySale||0;
                  const goly=lySale?(((totGsv/lySale)-1)*100):null;
                  return (
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>{['Month','Sale','Bills','Qty','AUPT','AVPT','MoM Growth'].map(h=><th key={h} style={h==='Month'?th:{...th,textAlign:'right'}}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {withMoM.map(m=>(
                            <tr key={m.mk}>
                              <td style={{...td,fontWeight:600}}>{monthLabel(m.mk)}</td>
                              <td style={tdR}>{fmtRs(m.gsv)}</td>
                              <td style={tdR}>{m.bills}</td>
                              <td style={tdR}>{m.qty}</td>
                              <td style={{...tdR,color:m.aupt>=4?'var(--green)':'var(--text1)'}}>{m.aupt.toFixed(2)}</td>
                              <td style={tdR}>{fmtRs(m.avpt)}</td>
                              <td style={{...tdR,fontWeight:600,color:m.mom==null?'var(--text2)':m.mom>=0?'var(--green)':'var(--red)'}}>
                                {m.mom==null?'—':`${m.mom>=0?'+':''}${m.mom.toFixed(1)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{background:'var(--bg2)',fontWeight:700}}>
                            <td style={td}>Total / Overall</td>
                            <td style={tdR}>{fmtRs(totGsv)}</td>
                            <td style={tdR}>{totBills}</td>
                            <td style={tdR}>{totQty}</td>
                            <td style={{...tdR,color:totBills&&totQty/totBills>=4?'var(--green)':'var(--text1)'}}>{totBills?(totQty/totBills).toFixed(2):'—'}</td>
                            <td style={tdR}>{totBills?fmtRs(totGsv/totBills):'—'}</td>
                            <td style={{...tdR,color:goly==null?'var(--text2)':goly>=0?'var(--green)':'var(--red)'}}>
                              {goly!=null?`GOLY: ${goly>=0?'+':''}${goly.toFixed(1)}%`:(lySale?'—':'Set LY Sale in Edit')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab 9: Loss of Sale ── */}
      {activeTab === 9 && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:15}}>😞 Loss of Sale Tracker <span style={{fontSize:12,color:'var(--text2)',fontWeight:400}}>({losRows.length} entries)</span></div>
            <button onClick={()=>setShowLosForm(true)} className="btn btn-brand btn-sm">+ Add Entry</button>
          </div>
          {showLosForm && (() => {
            const losCats = Array.from(new Set(salesRows.map(r=>r.Category).filter(Boolean))).sort() as string[];
            const losSubs = (losForm.category
              ? salesRows.filter(r=>r.Category===losForm.category)
              : salesRows
            ).reduce((acc,r)=>{if(r.SubCategory&&!acc.includes(r.SubCategory))acc.push(r.SubCategory);return acc;},[] as string[]).sort();
            const losTypeOpts = Array.from(new Set(losRows.map(r=>r.typeLevel).filter(Boolean))).sort() as string[];
            const selStyle:React.CSSProperties = {width:'100%',padding:'6px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text1)',boxSizing:'border-box'};
            const inpStyle:React.CSSProperties = {width:'100%',padding:'6px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text1)',boxSizing:'border-box'};
            return (
              <div style={{...card,border:'2px solid var(--brand)',marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>New Loss of Sale Entry</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                  {/* Static inputs: date, customer, contact */}
                  {([['date','Date','date'],['customerName','Customer Name','text'],['contactNo','Contact No','tel']] as [keyof LosEntry,string,string][]).map(([key,label,type])=>(
                    <div key={key}>
                      <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>{label}</label>
                      <input type={type} value={(losForm as any)[key]||''} onChange={e=>setLosForm(p=>({...p,[key]:e.target.value}))} style={inpStyle}/>
                    </div>
                  ))}
                  {/* Category dropdown from ASR data */}
                  <div>
                    <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>Category</label>
                    <select value={losForm.category||''} onChange={e=>setLosForm(p=>({...p,category:e.target.value,subCategory:''}))} style={selStyle}>
                      <option value="">— select —</option>
                      {losCats.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {/* Sub Category dropdown — cascades from selected category */}
                  <div>
                    <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>Sub Category</label>
                    <select value={losForm.subCategory||''} onChange={e=>setLosForm(p=>({...p,subCategory:e.target.value}))} style={selStyle}>
                      <option value="">— select —</option>
                      {losSubs.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {/* Type Level — text with datalist from existing entries */}
                  <div>
                    <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>Type Level</label>
                    <input list="los-type-opts" value={losForm.typeLevel||''} onChange={e=>setLosForm(p=>({...p,typeLevel:e.target.value}))} placeholder="Type or select..." style={inpStyle}/>
                    <datalist id="los-type-opts">{losTypeOpts.map(t=><option key={t} value={t}/>)}</datalist>
                  </div>
                  {/* Remaining fields */}
                  {/* Age Group dropdown */}
                  <div>
                    <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>Age Group</label>
                    <select value={losForm.ageGroup||''} onChange={e=>setLosForm(p=>({...p,ageGroup:e.target.value}))} style={selStyle}>
                      <option value="">— select —</option>
                      {['0-3 Months','3-6 Months','6-12 Months','1-2 Years','2-3 Years','3-4 Years','4-5 Years','5-6 Years','6-8 Years','8-10 Years','10-12 Years','12-14 Years','14+ Years'].map(ag=><option key={ag} value={ag}>{ag}</option>)}
                    </select>
                  </div>
                  {([['gender','Gender','text'],['priceRange','Price Range','text'],['staffName','Staff Name','text'],['followUpDate','Follow Up Date','date']] as [keyof LosEntry,string,string][]).map(([key,label,type])=>(
                    <div key={key}>
                      <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>{label}</label>
                      <input type={type} value={(losForm as any)[key]||''} onChange={e=>setLosForm(p=>({...p,[key]:e.target.value}))} style={inpStyle}/>
                    </div>
                  ))}
                </div>
                {[['requirement','Customer Requirement'],['remark','Remark by Store Manager']].map(([key,label])=>(
                  <div key={key} style={{marginTop:10}}>
                    <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>{label}</label>
                    <textarea value={(losForm as any)[key]||''} onChange={e=>setLosForm(p=>({...p,[key]:e.target.value}))}
                      rows={2} style={{width:'100%',padding:'6px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text1)',resize:'vertical',boxSizing:'border-box'}}/>
                  </div>
                ))}
                <div style={{marginTop:10}}>
                  <label style={{fontSize:11,color:'var(--text2)',fontWeight:600,display:'block',marginBottom:3}}>Status</label>
                  <select value={losForm.status||''} onChange={e=>setLosForm(p=>({...p,status:e.target.value}))}
                    style={{padding:'6px 10px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text1)'}}>
                    <option value="">— select —</option>
                    {['Gap','Fulfilled','Pending','Follow Up'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',gap:8,marginTop:14}}>
                  <button onClick={()=>{const e:LosEntry={id:Date.now().toString(),store:'FC',...losForm}as LosEntry;saveLosRows([...losRows,e]);setLosForm({});setShowLosForm(false);}} className="btn btn-brand btn-sm">Save Entry</button>
                  <button onClick={()=>{setLosForm({});setShowLosForm(false);}} className="btn btn-ghost btn-sm">Cancel</button>
                </div>
              </div>
            );
          })()}
          {/* ── Filter bar ── */}
          <div style={{...card,marginBottom:12,padding:'10px 14px'}}>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontSize:12,fontWeight:600,color:'var(--text2)'}}>🔍 Filter:</span>
              <input type="date" value={losFilterDateFrom} onChange={e=>setLosFilterDateFrom(e.target.value)} title="From date"
                style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg1)',color:'var(--text1)'}}/>
              <span style={{fontSize:12,color:'var(--text2)'}}>→</span>
              <input type="date" value={losFilterDateTo} onChange={e=>setLosFilterDateTo(e.target.value)} title="To date"
                style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg1)',color:'var(--text1)'}}/>
              <select value={losFilterCat} onChange={e=>{setLosFilterCat(e.target.value);setLosFilterSub('');}}
                style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg1)',color:'var(--text1)'}}>
                <option value="">All Categories</option>
                {Array.from(new Set([...salesRows.map(r=>r.Category),...losRows.map(r=>r.category)].filter(Boolean))).sort().map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select value={losFilterSub} onChange={e=>setLosFilterSub(e.target.value)}
                style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg1)',color:'var(--text1)'}}>
                <option value="">All Sub-Categories</option>
                {Array.from(new Set(
                  (losFilterCat
                    ? [...salesRows.filter(r=>r.Category===losFilterCat).map(r=>r.SubCategory),...losRows.filter(r=>r.category===losFilterCat).map(r=>r.subCategory)]
                    : [...salesRows.map(r=>r.SubCategory),...losRows.map(r=>r.subCategory)]
                  ).filter(Boolean)
                )).sort().map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={losFilterAge} onChange={e=>setLosFilterAge(e.target.value)}
                style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg1)',color:'var(--text1)'}}>
                <option value="">All Age Groups</option>
                {Array.from(new Set(losRows.map(r=>r.ageGroup).filter(Boolean))).sort().map(a=><option key={a} value={a}>{a}</option>)}
              </select>
              {(losFilterCat||losFilterSub||losFilterDateFrom||losFilterDateTo||losFilterAge)&&(
                <button onClick={()=>{setLosFilterCat('');setLosFilterSub('');setLosFilterDateFrom('');setLosFilterDateTo('');setLosFilterAge('');}} className="btn btn-ghost btn-sm" style={{fontSize:11}}>✕ Clear</button>
              )}
            </div>
          </div>
          {/* ── Entries table ── */}
          <div style={card}>
            {(() => {
              let filtered=[...losRows].reverse();
              if(losFilterDateFrom) filtered=filtered.filter(r=>r.date>=losFilterDateFrom);
              if(losFilterDateTo) filtered=filtered.filter(r=>r.date<=losFilterDateTo);
              if(losFilterCat) filtered=filtered.filter(r=>r.category===losFilterCat);
              if(losFilterSub) filtered=filtered.filter(r=>r.subCategory===losFilterSub);
              if(losFilterAge) filtered=filtered.filter(r=>r.ageGroup===losFilterAge);
              return filtered.length===0?(
                <div style={{padding:32,textAlign:'center',color:'var(--text2)',fontSize:13}}>
                  {losRows.length===0?'No entries yet. Click "+ Add Entry" to record a customer loss of sale.':`No entries match the selected filters. (${losRows.length} total)`}
                </div>
              ):(
                <div className="tbl-wrap">
                  <table>
                    <thead><tr>{['Date','Customer','Contact','Category','Sub Cat','Type','Age','Gender','Price','Requirement','Remark','Status','Staff','Follow Up',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {filtered.map(r=>(
                        <tr key={r.id}>
                          <td style={td}>{r.date}</td>
                          <td style={{...td,fontWeight:600}}>{r.customerName}</td>
                          <td style={td}>{r.contactNo}</td>
                          <td style={td}>{r.category}</td>
                          <td style={td}>{r.subCategory}</td>
                          <td style={td}>{r.typeLevel}</td>
                          <td style={td}>{r.ageGroup}</td>
                          <td style={td}>{r.gender}</td>
                          <td style={td}>{r.priceRange}</td>
                          <td style={{...td,maxWidth:180,whiteSpace:'normal'}}>{r.requirement}</td>
                          <td style={{...td,maxWidth:150,whiteSpace:'normal',color:'var(--text2)'}}>{r.remark}</td>
                          <td style={td}><span style={{padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:700,background:r.status==='Gap'?'rgba(239,68,68,0.12)':r.status==='Fulfilled'?'rgba(16,185,129,0.12)':'rgba(245,158,11,0.12)',color:r.status==='Gap'?'var(--red)':r.status==='Fulfilled'?'var(--green)':'#d97706'}}>{r.status||'—'}</span></td>
                          <td style={td}>{r.staffName}</td>
                          <td style={td}>{r.followUpDate}</td>
                          <td style={td}><button onClick={()=>saveLosRows(losRows.filter(x=>x.id!==r.id))} className="btn btn-ghost btn-sm" style={{fontSize:11,color:'var(--red)'}}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Tab 10: CMP Tracker ── */}
      {activeTab === 10 && (() => {
        const [y,mo]=cmpMonth.split('-').map(Number);
        const daysInMonth=new Date(y,mo,0).getDate();
        const DNAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const days=Array.from({length:daysInMonth},(_,i)=>{
          const d=new Date(y,mo-1,i+1);
          return {day:i+1,dayName:DNAMES[d.getDay()],key:d.toISOString().slice(0,10)};
        });
        const total=days.reduce((s,d)=>s+(cmpData[d.key]||0),0);
        const filled=days.filter(d=>cmpData[d.key]!==undefined).length;
        const startDow=new Date(y,mo-1,1).getDay();
        return (
          <div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
              <div style={{fontWeight:700,fontSize:15}}>🎯 CMP Tracker</div>
              <input type="month" value={cmpMonth} onChange={e=>setCmpMonth(e.target.value)}
                style={{padding:'5px 10px',fontSize:13,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg1)',color:'var(--text1)'}}/>
              <div style={{fontSize:13,color:'var(--text2)'}}>Total: <strong style={{color:'var(--text1)'}}>{total}</strong> CMP · {filled}/{daysInMonth} days filled · Avg: {filled?(total/filled).toFixed(1):'—'}/day</div>
            </div>
            <div style={card}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:8,marginBottom:8}}>
                {DNAMES.map(d=><div key={d} style={{textAlign:'center',fontSize:11,fontWeight:700,color:'var(--text2)',padding:'4px 0'}}>{d}</div>)}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:8}}>
                {Array.from({length:startDow},(_,i)=><div key={`e${i}`}/>)}
                {days.map(({day,key})=>{
                  const val=cmpData[key];
                  return (
                    <div key={key} style={{border:'1px solid var(--border)',borderRadius:8,padding:'8px 6px',background:val!=null&&val>0?'rgba(16,185,129,0.07)':'var(--bg2)',textAlign:'center'}}>
                      <div style={{fontSize:10,color:'var(--text2)',marginBottom:4}}>{day}</div>
                      <input type="number" min="0" value={val??''} placeholder="—"
                        onChange={e=>{const n=e.target.value===''?undefined:+e.target.value;const nd={...cmpData};if(n===undefined)delete nd[key];else nd[key]=n;saveCmpData(nd);}}
                        style={{width:'100%',padding:'3px 2px',fontSize:14,fontWeight:700,borderRadius:4,border:'1px solid var(--border)',background:'transparent',color:val&&val>0?'var(--green)':'var(--text1)',textAlign:'center'}}/>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginTop:12}}>
              {[{label:'Total CMP',value:total,color:'#1d4ed8'},{label:'Days Recorded',value:`${filled}/${daysInMonth}`,color:'#059669'},{label:'Daily Average',value:filled?(total/filled).toFixed(1):'—',color:'#7c3aed'},{label:'Days Remaining',value:daysInMonth-filled,color:'#b45309'}].map(({label,value,color})=>(
                <div key={label} style={{padding:'12px 16px',borderRadius:8,background:'var(--bg1)',border:'1px solid var(--border)'}}>
                  <div style={{fontSize:11,color:'var(--text2)',fontWeight:600,marginBottom:4}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:700,color}}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

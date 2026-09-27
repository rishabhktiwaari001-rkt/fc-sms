import React, { useState, useCallback, useMemo } from 'react';

interface SaleRow {
  BillDate: Date;
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
    return {
      BillDate: date, SalesPerson: sp.trim(), GSV: gsv, Quantity: qty,
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
    const singleBills = [...s.invQty.values()].filter(q => q === 1).length;
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
  const [selCat, setSelCat] = useState('All');
  const [selSub, setSelSub] = useState('All');
  const [transpose, setTranspose] = useState(false);

  const TABS = ['🏆 Rankings', '🔍 Category', '💳 Memberships', '📅 Sales Reports', '⚠️ Single Bills'];

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(null); setRows([]);
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

  const salesRows = useMemo(() => rows.filter(r => !r.isMembership && r.Category !== 'Free Sample Category'), [rows]);
  const memRows = useMemo(() => rows.filter(r => r.isMembership), [rows]);
  const staffStats = useMemo(() => buildStaffStats(salesRows), [salesRows]);
  const maxWeek = useMemo(() => Math.max(0, ...rows.map(r => r.Week)), [rows]);

  const weeklyWinners = useMemo(() => {
    if (!maxWeek) return [];
    return buildStaffStats(salesRows.filter(r => r.Week === maxWeek)).filter(s => s.aupt >= 4 && s.avpt >= 3000);
  }, [salesRows, maxWeek]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(salesRows.map(r => r.Category).filter(Boolean))).sort()], [salesRows]);
  const subCategories = useMemo(() => {
    if (selCat === 'All') return ['All'];
    return ['All', ...Array.from(new Set(salesRows.filter(r => r.Category === selCat).map(r => r.SubCategory).filter(Boolean))).sort()];
  }, [salesRows, selCat]);

  const filteredCatRows = useMemo(() => {
    let f = salesRows;
    if (selCat !== 'All') f = f.filter(r => r.Category === selCat);
    if (selSub !== 'All') f = f.filter(r => r.SubCategory === selSub);
    return f;
  }, [salesRows, selCat, selSub]);

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
    for (const r of salesRows) {
      const k = r.BillDate.toISOString().slice(0, 10);
      if (!map[k]) map[k] = { date: r.BillDate, day: r.DayName, gsv: 0 };
      map[k].gsv += r.GSV;
    }
    return Object.values(map).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [salesRows]);

  const weekWise = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of salesRows) { map[r.WeekLabel] = (map[r.WeekLabel] || 0) + r.GSV; }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [salesRows]);

  const card = { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const th = { padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textAlign: 'left' as const, borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' as const };
  const td = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const };
  const tdR = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  const badge = (color: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color });

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total GSV', value: fmtRs(salesRows.reduce((s, r) => s + r.GSV, 0)), color: '#1d4ed8' },
              { label: 'Total Bills', value: new Set(salesRows.map(r => r.InvoiceNumber)).size, color: '#059669' },
              { label: 'Staff Count', value: staffStats.length, color: '#7c3aed' },
              { label: 'File', value: fileName, color: '#b45309' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...card, marginBottom: 0, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {TABS.map((t, i) => (
              <button key={i} onClick={() => setActiveTab(i)} className={`btn btn-sm ${activeTab === i ? 'btn-brand' : 'btn-ghost'}`} style={{ fontSize: 12 }}>{t}</button>
            ))}
          </div>

          {activeTab === 0 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🏆 Staff Rankings (by GSV)</div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>{['Rank', 'Name', 'Total GSV', 'Qty', 'Bills', 'AVPT', 'AUPT', 'Single Bills', 'Single %'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
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

          {activeTab === 1 && (
            <div style={card}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Category</label>
                  <select value={selCat} onChange={e => { setSelCat(e.target.value); setSelSub('All'); }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 }}>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Sub-Category</label>
                  <select value={selSub} onChange={e => setSelSub(e.target.value)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text1)', fontSize: 13 }}>
                    {subCategories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
                  <input type="checkbox" checked={transpose} onChange={e => setTranspose(e.target.checked)} />
                  🔄 Transpose View
                </label>
                <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Total: {fmtRs(catStats.total)}</div>
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

          {activeTab === 2 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>💳 Membership Hub</div>
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

          {activeTab === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📅 Day-wise Sales</div>
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
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🗓️ Week-wise Sales</div>
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

          {activeTab === 4 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⚠️ Single Bill Risk</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>Staff with high single-item bills need upselling improvement</div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>{['Rank', 'SalesPerson', 'Total Bills', 'Single Bills', 'Single Bill %'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
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
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CashbookEntry {
  id: string; date: string; openingCash: number;
  cbCash: number; cbCreditCard: number; cbUpi: number; cbManualBill: number; cbCreditNote: number;
  sysCash: number; sysCreditCard: number; sysPinelab: number; sysUpi: number; sysCreditNote: number;
  depositDate: string | null; depositAmount: number; depositBank: string;
  d2000: number; d500: number; d200: number; d100: number; d50: number;
  d20: number; d10: number; d5: number; d2: number; d1: number;
  remark: string | null; updatedAt: string;
}

type DenomKey = 'd2000'|'d500'|'d200'|'d100'|'d50'|'d20'|'d10'|'d5'|'d2'|'d1';
const DENOMS: { key: DenomKey; value: number }[] = [
  { key:'d2000', value:2000 }, { key:'d500', value:500 }, { key:'d200', value:200 },
  { key:'d100', value:100  }, { key:'d50',  value:50  }, { key:'d20',  value:20  },
  { key:'d10',  value:10   }, { key:'d5',   value:5   }, { key:'d2',   value:2   },
  { key:'d1',   value:1    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function fmtRs(n: number) { return `₹${Number(n||0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'; }
function denomTotal(e: Partial<CashbookEntry>) {
  return DENOMS.reduce((s, { key, value }) => s + (Number(e[key])||0) * value, 0);
}
function cbTotal(e: Partial<CashbookEntry>) {
  return (Number(e.cbCash)||0) + (Number(e.cbCreditCard)||0) + (Number(e.cbUpi)||0) + (Number(e.cbManualBill)||0) - (Number(e.cbCreditNote)||0);
}
function sysTotal(e: Partial<CashbookEntry>) {
  return (Number(e.sysCash)||0) + (Number(e.sysCreditCard)||0) + (Number(e.sysPinelab)||0) + (Number(e.sysUpi)||0) - (Number(e.sysCreditNote)||0);
}

type FormState = Omit<CashbookEntry, 'id'|'updatedAt'>;
function emptyForm(date = today(), opening = 0): FormState {
  return {
    date, openingCash: opening,
    cbCash:0, cbCreditCard:0, cbUpi:0, cbManualBill:0, cbCreditNote:0,
    sysCash:0, sysCreditCard:0, sysPinelab:0, sysUpi:0, sysCreditNote:0,
    depositDate:null, depositAmount:0, depositBank:'HDFC BANK',
    d2000:0, d500:0, d200:0, d100:0, d50:0, d20:0, d10:0, d5:0, d2:0, d1:0,
    remark: null,
  };
}

// ── Input helper ──────────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, small }: { label: string; value: number; onChange: (v: number) => void; small?: boolean }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
      <label style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>{label}</label>
      <input
        type="number" min={0} step="0.01"
        value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value)||0)}
        style={{
          padding: small ? '4px 8px' : '6px 10px',
          fontSize: small ? 13 : 14,
          border:'1px solid var(--border)', borderRadius:6,
          background:'var(--bg1)', color:'var(--text1)', outline:'none',
          width: small ? 80 : '100%',
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Cashbook() {
  const [activeDate, setActiveDate] = useState(today());
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [history, setHistory] = useState<CashbookEntry[]>([]);
  const [historyMonth, setHistoryMonth] = useState(today().slice(0,7));
  const [histLoading, setHistLoading] = useState(false);
  const [tab, setTab] = useState<'entry'|'history'>('entry');
  const [openingMode, setOpeningMode] = useState<'auto'|'manual'>('auto');
  const [autoOpening, setAutoOpening] = useState(0);

  // Load entry for selected date
  const loadEntry = useCallback(async (date: string) => {
    setError(null); setSaved(false);
    try {
      const entryRes = await api.get(`/cashbook/${date}`);
      const entry: CashbookEntry | null = entryRes.data.data;
      const openRes = await api.get(`/cashbook/opening?date=${date}`);
      const opening: number = openRes.data.data?.opening ?? 0;
      setAutoOpening(opening);

      if (entry) {
        setForm({ ...entry });
        // If saved opening differs from auto, switch to manual mode
        setOpeningMode(Math.abs(entry.openingCash - opening) > 0.01 ? 'manual' : 'auto');
      } else {
        setForm(emptyForm(date, opening));
        setOpeningMode('auto');
      }
    } catch {
      setForm(emptyForm(date));
      setAutoOpening(0);
    }
  }, []);

  useEffect(() => { loadEntry(activeDate); }, [activeDate, loadEntry]);

  // Load history
  const loadHistory = useCallback(async (month: string) => {
    setHistLoading(true);
    try {
      const res = await api.get(`/cashbook?month=${month}`);
      setHistory(res.data.data ?? []);
    } catch { setHistory([]); }
    finally { setHistLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'history') loadHistory(historyMonth); }, [tab, historyMonth, loadHistory]);

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await api.post('/cashbook', form);
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  }

  // Computed values
  const cb  = cbTotal(form);
  const sys = sysTotal(form);
  const diff = cb - sys;
  const denomCash = denomTotal(form);
  const closingCash = (form.openingCash || 0) + (form.cbCash || 0) - (form.depositAmount || 0);

  // Section header style
  const sectionHead = (color = '#1d4ed8') => ({
    fontSize: 12, fontWeight: 700, letterSpacing: 1, color, textTransform: 'uppercase' as const,
    padding: '8px 0 6px', borderBottom: `2px solid ${color}22`, marginBottom: 10,
  });

  const card = { background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:16 };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">💰 Cashbook</div>
          <div className="page-sub">Daily cash register — track, reconcile &amp; deposit</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className={`btn btn-sm ${tab==='entry'?'btn-brand':'btn-ghost'}`} onClick={() => setTab('entry')}>Today's Entry</button>
          <button className={`btn btn-sm ${tab==='history'?'btn-brand':'btn-ghost'}`} onClick={() => setTab('history')}>History</button>
        </div>
      </div>

      {/* ══════════ ENTRY TAB ══════════ */}
      {tab === 'entry' && (
        <>
          {/* Date + Opening Cash selector */}
          <div style={{ ...card, padding:'12px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
              <label style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>Entry Date:</label>
              <input
                type="date"
                value={activeDate}
                onChange={e => { setActiveDate(e.target.value); }}
                style={{ padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg1)', color:'var(--text1)', fontSize:14 }}
              />
              <div style={{ display:'flex', alignItems:'center', gap:10, marginLeft:'auto' }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>Opening Cash:</span>
                {/* Mode toggle */}
                <div style={{ display:'flex', borderRadius:6, overflow:'hidden', border:'1px solid var(--border)' }}>
                  <button
                    onClick={() => { setOpeningMode('auto'); setField('openingCash', autoOpening); }}
                    style={{ padding:'4px 10px', fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                      background: openingMode==='auto' ? 'var(--brand)' : 'var(--bg1)',
                      color: openingMode==='auto' ? '#fff' : 'var(--text2)' }}>
                    Auto
                  </button>
                  <button
                    onClick={() => setOpeningMode('manual')}
                    style={{ padding:'4px 10px', fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                      background: openingMode==='manual' ? 'var(--brand)' : 'var(--bg1)',
                      color: openingMode==='manual' ? '#fff' : 'var(--text2)' }}>
                    Manual
                  </button>
                </div>
                {openingMode === 'auto' ? (
                  <strong style={{ fontSize:15, color:'var(--text1)' }}>{fmtRs(form.openingCash)}</strong>
                ) : (
                  <input
                    type="number" min={0} step="0.01"
                    value={form.openingCash || ''}
                    onChange={e => setField('openingCash', parseFloat(e.target.value)||0)}
                    placeholder="Enter opening cash"
                    style={{ padding:'5px 10px', borderRadius:6, border:'1px solid var(--brand)', background:'var(--bg1)', color:'var(--text1)', fontSize:14, width:160 }}
                  />
                )}
                {openingMode === 'auto' && (
                  <span style={{ fontSize:11, color:'var(--text2)' }}>from prev day denom</span>
                )}
              </div>
            </div>
          </div>

          {/* Status messages */}
          {error && (
            <div style={{ marginBottom:12, padding:'8px 14px', borderRadius:6, fontSize:13, fontWeight:500, background:'rgba(239,68,68,0.1)', color:'var(--red)', border:'1px solid rgba(239,68,68,0.25)' }}>
              ✗ {error}
            </div>
          )}
          {saved && (
            <div style={{ marginBottom:12, padding:'8px 14px', borderRadius:6, fontSize:13, fontWeight:500, background:'rgba(16,185,129,0.1)', color:'var(--green)', border:'1px solid rgba(16,185,129,0.25)' }}>
              ✓ Saved successfully
            </div>
          )}

          {/* ── Cash Book (Manual) + System — side by side ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

            {/* MANUAL side */}
            <div style={card}>
              <div style={sectionHead('#1d4ed8')}>📒 Cash Book (Manual)</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <NumInput label="Cash" value={form.cbCash} onChange={v => setField('cbCash', v)} />
                <NumInput label="Credit Card" value={form.cbCreditCard} onChange={v => setField('cbCreditCard', v)} />
                <NumInput label="UPI" value={form.cbUpi} onChange={v => setField('cbUpi', v)} />
                <NumInput label="Manual Bill" value={form.cbManualBill} onChange={v => setField('cbManualBill', v)} />
                <NumInput label="Credit Note (CN)" value={form.cbCreditNote} onChange={v => setField('cbCreditNote', v)} />
              </div>
              <div style={{ marginTop:12, padding:'10px 12px', borderRadius:8, background:'var(--bg2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13, fontWeight:600 }}>Total</span>
                <span style={{ fontSize:16, fontWeight:700, color:'#1d4ed8' }}>{fmtRs(cb)}</span>
              </div>
            </div>

            {/* SYSTEM side */}
            <div style={card}>
              <div style={sectionHead('#059669')}>🖥️ As Per System</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <NumInput label="Cash" value={form.sysCash} onChange={v => setField('sysCash', v)} />
                <NumInput label="Credit Card" value={form.sysCreditCard} onChange={v => setField('sysCreditCard', v)} />
                <NumInput label="Pinelab" value={form.sysPinelab} onChange={v => setField('sysPinelab', v)} />
                <NumInput label="HDFC UPI" value={form.sysUpi} onChange={v => setField('sysUpi', v)} />
                <NumInput label="Credit Note (CN)" value={form.sysCreditNote} onChange={v => setField('sysCreditNote', v)} />
              </div>
              <div style={{ marginTop:12, padding:'10px 12px', borderRadius:8, background:'var(--bg2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13, fontWeight:600 }}>Total</span>
                <span style={{ fontSize:16, fontWeight:700, color:'#059669' }}>{fmtRs(sys)}</span>
              </div>
            </div>
          </div>

          {/* ── Difference banner ── */}
          <div style={{ ...card, padding:'14px 20px', background: diff === 0 ? 'rgba(16,185,129,0.08)' : diff > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.08)', border:`1px solid ${diff===0?'rgba(16,185,129,0.3)':diff>0?'rgba(245,158,11,0.3)':'rgba(239,68,68,0.3)'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:14, fontWeight:600 }}>
                {diff === 0 ? '✅ Books Match!' : diff > 0 ? '⚠️ Manual OVER System by' : '🔴 Manual SHORT of System by'}
              </span>
              <span style={{ fontSize:20, fontWeight:700, color: diff===0?'var(--green)':diff>0?'#d97706':'var(--red)' }}>
                {diff !== 0 && (diff > 0 ? '+' : '')}{fmtRs(Math.abs(diff))}
              </span>
            </div>
          </div>

          {/* ── Bank Deposit + Denomination — side by side ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:16, marginBottom:16 }}>

            {/* Bank Deposit */}
            <div style={card}>
              <div style={sectionHead('#7c3aed')}>🏦 Bank Deposit</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>Deposit Date</label>
                  <input
                    type="date"
                    value={form.depositDate ?? ''}
                    onChange={e => setField('depositDate', e.target.value || null)}
                    style={{ display:'block', width:'100%', marginTop:4, padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg1)', color:'var(--text1)', fontSize:14 }}
                  />
                </div>
                <NumInput label="Deposit Amount (₹)" value={form.depositAmount} onChange={v => setField('depositAmount', v)} />
                <div>
                  <label style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>Bank Name</label>
                  <input
                    type="text"
                    value={form.depositBank}
                    onChange={e => setField('depositBank', e.target.value)}
                    style={{ display:'block', width:'100%', marginTop:4, padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg1)', color:'var(--text1)', fontSize:14 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>Remark</label>
                  <input
                    type="text"
                    value={form.remark ?? ''}
                    onChange={e => setField('remark', e.target.value || null)}
                    placeholder="Optional note…"
                    style={{ display:'block', width:'100%', marginTop:4, padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg1)', color:'var(--text1)', fontSize:14 }}
                  />
                </div>
              </div>
              <div style={{ marginTop:12, padding:'10px 12px', borderRadius:8, background:'var(--bg2)', fontSize:13 }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span>Opening Cash</span><strong>{fmtRs(form.openingCash)}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                  <span>+ Cash Sales Today</span><strong>{fmtRs(form.cbCash)}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, color:'var(--red)' }}>
                  <span>− Deposit</span><strong>−{fmtRs(form.depositAmount)}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700 }}>
                  <span>Closing Cash (expected)</span><span style={{ color:'#7c3aed' }}>{fmtRs(closingCash)}</span>
                </div>
              </div>
            </div>

            {/* Denomination Counter */}
            <div style={card}>
              <div style={sectionHead('#b45309')}>🪙 Note / Coin Count</div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ color:'var(--text2)', fontSize:11 }}>
                    <th style={{ textAlign:'left', padding:'3px 4px', fontWeight:600 }}>Denom</th>
                    <th style={{ textAlign:'center', padding:'3px 4px', fontWeight:600 }}>Count</th>
                    <th style={{ textAlign:'right', padding:'3px 4px', fontWeight:600 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {DENOMS.map(({ key, value }) => {
                    const count = Number(form[key]) || 0;
                    return (
                      <tr key={key} style={{ borderTop:'1px solid var(--border)' }}>
                        <td style={{ padding:'5px 4px', fontWeight:600, color:'var(--text1)' }}>₹{value}</td>
                        <td style={{ padding:'3px 4px', textAlign:'center' }}>
                          <input
                            type="number" min={0} step={1}
                            value={count || ''}
                            onChange={e => setField(key as keyof FormState, parseInt(e.target.value)||0 as any)}
                            style={{
                              width:70, textAlign:'center', padding:'3px 6px',
                              border:'1px solid var(--border)', borderRadius:5,
                              background:'var(--bg1)', color:'var(--text1)', fontSize:13,
                            }}
                          />
                        </td>
                        <td style={{ padding:'5px 4px', textAlign:'right', fontVariantNumeric:'tabular-nums', color: count>0 ? 'var(--text1)' : 'var(--text2)' }}>
                          {count > 0 ? fmtRs(count * value) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--bg2)', fontWeight:700 }}>
                    <td colSpan={2} style={{ padding:'8px 4px', fontSize:13 }}>Total Cash in Hand</td>
                    <td style={{ padding:'8px 4px', textAlign:'right', fontSize:15, color:'#b45309' }}>{fmtRs(denomCash)}</td>
                  </tr>
                  {Math.abs(denomCash - closingCash) > 0.01 && (
                    <tr style={{ color: denomCash >= closingCash ? 'var(--green)' : 'var(--red)' }}>
                      <td colSpan={2} style={{ padding:'4px 4px', fontSize:11 }}>vs. Expected Closing</td>
                      <td style={{ padding:'4px 4px', textAlign:'right', fontSize:12, fontWeight:600 }}>
                        {denomCash >= closingCash ? '+' : ''}{fmtRs(denomCash - closingCash)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Save button ── */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginBottom:24 }}>
            <button className="btn btn-brand" disabled={saving} onClick={handleSave} style={{ minWidth:140, fontSize:15 }}>
              {saving ? '⟳ Saving…' : '💾 Save Entry'}
            </button>
          </div>
        </>
      )}

      {/* ══════════ HISTORY TAB ══════════ */}
      {tab === 'history' && (
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>Past Entries</div>
            <input
              type="month"
              value={historyMonth}
              onChange={e => setHistoryMonth(e.target.value)}
              style={{ padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg1)', color:'var(--text1)', fontSize:13 }}
            />
          </div>

          {histLoading && <div className="loading">Loading…</div>}

          {!histLoading && history.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--text2)' }}>No entries for this month.</div>
          )}

          {!histLoading && history.length > 0 && (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign:'right' }}>CB Cash</th>
                    <th style={{ textAlign:'right' }}>CB CC</th>
                    <th style={{ textAlign:'right' }}>CB UPI</th>
                    <th style={{ textAlign:'right' }}>CB Total</th>
                    <th style={{ textAlign:'right' }}>Sys Total</th>
                    <th style={{ textAlign:'right' }}>Diff</th>
                    <th style={{ textAlign:'right' }}>Deposit</th>
                    <th style={{ textAlign:'right' }}>Cash in Hand</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(e => {
                    const cb_ = cbTotal(e), sys_ = sysTotal(e), diff_ = cb_ - sys_, denom_ = denomTotal(e);
                    return (
                      <tr key={e.id} style={{ cursor:'pointer' }} onClick={() => { setActiveDate(e.date); setTab('entry'); }}>
                        <td style={{ fontWeight:600 }}>{fmtDate(e.date)}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtRs(e.cbCash)}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtRs(e.cbCreditCard)}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtRs(e.cbUpi)}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmtRs(cb_)}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'#059669' }}>{fmtRs(sys_)}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600, color: diff_===0 ? 'var(--green)' : diff_>0 ? '#d97706' : 'var(--red)' }}>
                          {diff_>0?'+':''}{fmtRs(diff_)}
                        </td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:'#7c3aed' }}>{fmtRs(e.depositAmount)}</td>
                        <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, color:'#b45309' }}>{fmtRs(denom_)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--bg2)', fontWeight:700 }}>
                    <td>Month Total</td>
                    <td style={{ textAlign:'right' }}>{fmtRs(history.reduce((s,e)=>s+e.cbCash,0))}</td>
                    <td style={{ textAlign:'right' }}>{fmtRs(history.reduce((s,e)=>s+e.cbCreditCard,0))}</td>
                    <td style={{ textAlign:'right' }}>{fmtRs(history.reduce((s,e)=>s+e.cbUpi,0))}</td>
                    <td style={{ textAlign:'right' }}>{fmtRs(history.reduce((s,e)=>s+cbTotal(e),0))}</td>
                    <td style={{ textAlign:'right' }}>{fmtRs(history.reduce((s,e)=>s+sysTotal(e),0))}</td>
                    <td />
                    <td style={{ textAlign:'right', color:'#7c3aed' }}>{fmtRs(history.reduce((s,e)=>s+e.depositAmount,0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <div style={{ fontSize:11, color:'var(--text2)', padding:'8px 0', textAlign:'right' }}>
                Click any row to edit that day's entry
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

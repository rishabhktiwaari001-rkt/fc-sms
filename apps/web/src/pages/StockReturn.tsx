import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import type { StockReturn } from '@fc-sms/types';

type SRView = 'list' | 'new' | 'detail';

const PROCESS_OPTS = ['Damage Return', 'Defective Return', 'Excess Return', 'Wrong Item Return', 'Price Discrepancy'];
const TRANSPORTER_OPTS = ['DELHIVERY', 'BLUE DART', 'DTDC', 'ECOM EXPRESS', 'ROCKETBEES', 'OTHER'];
const REASON_OPTS = ['Damaged', 'Defective', 'Wrong Product', 'Size Issue', 'Price Mismatch', 'Other'];

const emptyForm = () => ({
  refNo: `SR-${Date.now().toString().slice(-6)}`,
  process: '',
  storeCode: '',
  requestedBy: '',
  approvedBy: '',
  category: '',
  subCategory: '',
  totalQty: '',
  totalMrp: '',
  totalCtc: '',
  reason: '',
  remark: '',
  transporterName: '',
  docketNo: '',
  boxes: '',
  dispatchDate: '',
  cnAmount: '',
  cn120Days: '',
  cn180Days: '',
  cnComment: '',
  isClosed: false,
});

export default function StockReturn() {
  const [view, setView] = useState<SRView>('list');
  const [active, setActive] = useState<StockReturn | null>(null);
  const { data: srs, loading, error, refetch } = useFetch<StockReturn[]>('/sr');
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  function f(key: string, val: string | boolean) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/sr', {
        ...form,
        totalQty: form.totalQty ? parseInt(form.totalQty) : undefined,
        totalMrp: form.totalMrp ? parseFloat(form.totalMrp) : undefined,
        totalCtc: form.totalCtc ? parseFloat(form.totalCtc) : undefined,
        cnAmount: form.cnAmount ? parseFloat(form.cnAmount) : undefined,
        cn120Days: form.cn120Days ? parseFloat(form.cn120Days) : undefined,
        cn180Days: form.cn180Days ? parseFloat(form.cn180Days) : undefined,
        boxes: form.boxes ? parseInt(form.boxes) : undefined,
      });
      refetch();
      setView('list');
      setForm(emptyForm());
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (view === 'detail' && active) {
    return <SRDetail sr={active} onBack={() => { setActive(null); setView('list'); }} />;
  }

  if (view === 'new') {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="page-title">New Stock Return</div>
            <div className="page-sub">{form.refNo}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => setView('list')}>← Back</button>
        </div>

        <form onSubmit={submit}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">SR Detail</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <div><label>Ref No</label><input className="inp" value={form.refNo} readOnly /></div>
              <div>
                <label>Process *</label>
                <select className="inp" value={form.process} onChange={e => f('process', e.target.value)} required>
                  <option value="">Select…</option>
                  {PROCESS_OPTS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div><label>Store Code</label><input className="inp" value={form.storeCode} onChange={e => f('storeCode', e.target.value)} /></div>
              <div><label>Requested By</label><input className="inp" value={form.requestedBy} onChange={e => f('requestedBy', e.target.value)} /></div>
              <div><label>Approved By</label><input className="inp" value={form.approvedBy} onChange={e => f('approvedBy', e.target.value)} /></div>
              <div><label>Category</label><input className="inp" value={form.category} onChange={e => f('category', e.target.value)} /></div>
              <div><label>Sub-Category</label><input className="inp" value={form.subCategory} onChange={e => f('subCategory', e.target.value)} /></div>
              <div><label>Total Qty</label><input className="inp" type="number" value={form.totalQty} onChange={e => f('totalQty', e.target.value)} /></div>
              <div><label>Total MRP</label><input className="inp" type="number" step="0.01" value={form.totalMrp} onChange={e => f('totalMrp', e.target.value)} /></div>
              <div><label>Total CTC</label><input className="inp" type="number" step="0.01" value={form.totalCtc} onChange={e => f('totalCtc', e.target.value)} /></div>
              <div>
                <label>Reason</label>
                <select className="inp" value={form.reason} onChange={e => f('reason', e.target.value)}>
                  <option value="">Select…</option>
                  {REASON_OPTS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '2/4' }}>
                <label>Remark</label>
                <input className="inp" value={form.remark} onChange={e => f('remark', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Transporter Detail</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <div>
                <label>Transporter Name</label>
                <select className="inp" value={form.transporterName} onChange={e => f('transporterName', e.target.value)}>
                  <option value="">Select…</option>
                  {TRANSPORTER_OPTS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div><label>Docket No</label><input className="inp" value={form.docketNo} onChange={e => f('docketNo', e.target.value)} /></div>
              <div><label>Boxes</label><input className="inp" type="number" value={form.boxes} onChange={e => f('boxes', e.target.value)} /></div>
              <div><label>Dispatch Date</label><input className="inp" type="date" value={form.dispatchDate} onChange={e => f('dispatchDate', e.target.value)} /></div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">CN Detail</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <div><label>CN Amount (₹)</label><input className="inp" type="number" step="0.01" value={form.cnAmount} onChange={e => f('cnAmount', e.target.value)} /></div>
              <div><label>CN 120 Days Debit</label><input className="inp" type="number" step="0.01" value={form.cn120Days} onChange={e => f('cn120Days', e.target.value)} /></div>
              <div><label>CN 180 Days Debit</label><input className="inp" type="number" step="0.01" value={form.cn180Days} onChange={e => f('cn180Days', e.target.value)} /></div>
              <div style={{ gridColumn: '1/4' }}>
                <label>CN Comment</label>
                <input className="inp" value={form.cnComment} onChange={e => f('cnComment', e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="isClosed" checked={form.isClosed} onChange={e => f('isClosed', e.target.checked)} />
                <label htmlFor="isClosed" style={{ margin: 0 }}>Mark as Closed</label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-brand" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Submit SR'}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setView('list')}>Cancel</button>
          </div>
        </form>
      </>
    );
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Stock Returns</div>
          <div className="page-sub">{(srs ?? []).length} returns</div>
        </div>
        <button className="btn btn-brand" onClick={() => setView('new')}>+ New SR</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Ref No</th>
                <th>Process</th>
                <th>Category</th>
                <th>Total Qty</th>
                <th>Total MRP</th>
                <th>Transporter</th>
                <th>Dispatch Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(srs ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>
                    No stock returns yet.
                  </td>
                </tr>
              )}
              {(srs ?? []).map(sr => (
                <tr key={sr.id}>
                  <td className="mono" style={{ fontWeight: 600, fontSize: 12 }}>{sr.refNo}</td>
                  <td>{sr.process}</td>
                  <td>{sr.category ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{sr.totalQty ?? '—'}</td>
                  <td className="mono">{sr.totalMrp ? `₹${Number(sr.totalMrp).toLocaleString('en-IN')}` : '—'}</td>
                  <td>{sr.transporterName ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {sr.dispatchDate ? new Date(sr.dispatchDate).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td>
                    <span className={`chip chip-${sr.isClosed ? 'gray' : 'green'}`}>
                      {sr.isClosed ? 'Closed' : 'Open'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setActive(sr); setView('detail'); }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SRDetail({ sr, onBack }: { sr: StockReturn; onBack: () => void }) {
  const rows = [
    ['Ref No', sr.refNo], ['Process', sr.process], ['Store Code', sr.storeCode],
    ['Requested By', sr.requestedBy], ['Approved By', sr.approvedBy],
    ['Category', sr.category], ['Sub-Category', sr.subCategory],
    ['Total Qty', sr.totalQty], ['Total MRP', sr.totalMrp ? `₹${Number(sr.totalMrp).toLocaleString('en-IN')}` : '—'],
    ['Total CTC', sr.totalCtc ? `₹${Number(sr.totalCtc).toLocaleString('en-IN')}` : '—'],
    ['Reason', sr.reason], ['Remark', sr.remark],
    ['Transporter', sr.transporterName], ['Docket', sr.docketNo],
    ['Boxes', sr.boxes], ['Dispatch Date', sr.dispatchDate ? new Date(sr.dispatchDate).toLocaleDateString('en-IN') : '—'],
    ['CN Amount', sr.cnAmount ? `₹${Number(sr.cnAmount).toLocaleString('en-IN')}` : '—'],
    ['CN 120 Days', sr.cn120Days ? `₹${Number(sr.cn120Days).toLocaleString('en-IN')}` : '—'],
    ['CN 180 Days', sr.cn180Days ? `₹${Number(sr.cn180Days).toLocaleString('en-IN')}` : '—'],
    ['CN Comment', sr.cnComment],
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">SR: {sr.refNo}</div>
          <div className="page-sub">{sr.process}</div>
        </div>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
      </div>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px 24px' }}>
          {rows.map(([label, val]) => val != null && String(val) ? (
            <div key={label as string}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>
                {label}
              </div>
              <div style={{ fontSize: 13 }}>{val}</div>
            </div>
          ) : null)}
        </div>
      </div>
    </>
  );
}

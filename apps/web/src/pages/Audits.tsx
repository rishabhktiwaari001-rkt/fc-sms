import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { Audit } from '@fc-sms/types';

export default function Audits() {
  const navigate = useNavigate();
  const { data: audits, loading, error, refetch } = useFetch<Audit[]>('/audits');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: '', subCategory: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);

  async function createAudit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/audits', form);
      setCreating(false);
      setForm({ category: '', subCategory: '', startDate: '', endDate: '' });
      navigate(`/audits/${res.data.data.id}`);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading audits…</div>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Audit</div>
          <div className="page-sub">{(audits ?? []).length} audit(s)</div>
        </div>
        <button className="btn btn-brand" onClick={() => setCreating(a => !a)}>
          {creating ? '✕ Cancel' : '+ New Audit'}
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Start New Audit</div>
          <form onSubmit={createAudit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 12 }}>
              <div>
                <label>Category *</label>
                <input className="inp" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required placeholder="e.g. Apparel" />
              </div>
              <div>
                <label>Sub-Category</label>
                <input className="inp" value={form.subCategory} onChange={e => setForm(f => ({ ...f, subCategory: e.target.value }))} placeholder="e.g. Boys T-Shirts" />
              </div>
              <div>
                <label>Start Date *</label>
                <input className="inp" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div>
                <label>End Date *</label>
                <input className="inp" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} required />
              </div>
            </div>
            <button className="btn btn-brand" type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create Audit'}
            </button>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Sub-Category</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Total Qty</th>
                <th>Total MRP</th>
                <th>Matched Qty</th>
                <th>Matched MRP</th>
                <th>Initiated By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(audits ?? []).length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>
                    No audits yet. Start one above.
                  </td>
                </tr>
              )}
              {(audits ?? []).map(audit => (
                <tr key={audit.id}>
                  <td>{audit.category}</td>
                  <td>{audit.subCategory ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{new Date(audit.startDate).toLocaleDateString('en-IN')}</td>
                  <td style={{ fontSize: 12 }}>{new Date(audit.endDate).toLocaleDateString('en-IN')}</td>
                  <td style={{ textAlign: 'center' }}>{audit.totalQty ?? 0}</td>
                  <td className="mono">₹{Number(audit.totalMrp ?? 0).toLocaleString('en-IN')}</td>
                  <td style={{ textAlign: 'center' }}>{audit.matchedQty ?? 0}</td>
                  <td className="mono">₹{Number(audit.matchedMrp ?? 0).toLocaleString('en-IN')}</td>
                  <td style={{ fontSize: 12 }}>{audit.initiatedBy}</td>
                  <td>
                    <span className={`chip chip-${audit.closedAt ? 'gray' : 'green'}`}>
                      {audit.closedAt ? 'Closed' : 'Open'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/audits/${audit.id}`)}>
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

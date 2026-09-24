import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { Member } from '@fc-sms/types';

export default function Members() {
  const [search, setSearch] = useState('');
  const { data: members, loading, error, refetch } = useFetch<Member[]>('/members');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', dob: '', loyaltyId: '' });
  const [saving, setSaving] = useState(false);

  const filtered = (members ?? []).filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search) ||
    (m.loyaltyId ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/members', form);
      setForm({ name: '', phone: '', email: '', dob: '', loyaltyId: '' });
      setAdding(false);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Members</div>
          <div className="page-sub">{filtered.length} member(s)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="inp"
            style={{ width: 220 }}
            placeholder="Search name, phone, loyalty ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn btn-brand" onClick={() => setAdding(a => !a)}>
            {adding ? '✕ Cancel' : '+ Add Member'}
          </button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Add Member</div>
          <form onSubmit={addMember}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
              <div><label>Full Name *</label><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div><label>Phone *</label><input className="inp" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required /></div>
              <div><label>Email</label><input className="inp" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label>Date of Birth</label><input className="inp" type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} /></div>
              <div><label>Loyalty ID</label><input className="inp" value={form.loyaltyId} onChange={e => setForm(f => ({ ...f, loyaltyId: e.target.value }))} /></div>
            </div>
            <button className="btn btn-brand btn-sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Member'}</button>
          </form>
        </div>
      )}

      {loading && <div className="loading">Loading members…</div>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Loyalty ID</th>
                  <th>DOB</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>No members yet.</td></tr>
                )}
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{m.phone}</td>
                    <td style={{ fontSize: 12 }}>{m.email ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{m.loyaltyId ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{m.dob ? new Date(m.dob).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ fontSize: 12 }}>{new Date(m.createdAt).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

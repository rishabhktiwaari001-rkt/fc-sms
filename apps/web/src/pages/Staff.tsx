import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { StaffMember } from '@fc-sms/types';
import { useAuth } from '../hooks/useAuth';

export default function Staff() {
  const { user } = useAuth();
  const { data: staff, loading, error, refetch } = useFetch<StaffMember[]>('/staff');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '', role: 'STAFF' });
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'STORE_ADMIN';

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/staff', form);
      setForm({ name: '', phone: '', password: '', role: 'STAFF' });
      setAdding(false);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string) {
    try {
      await api.patch(`/staff/${id}/toggle`);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Update failed');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Staff</div>
          <div className="page-sub">{(staff ?? []).length} staff member(s)</div>
        </div>
        {isAdmin && (
          <button className="btn btn-brand" onClick={() => setAdding(a => !a)}>
            {adding ? '✕ Cancel' : '+ Add Staff'}
          </button>
        )}
      </div>

      {adding && isAdmin && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Add Staff Member</div>
          <form onSubmit={addStaff}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 12 }}>
              <div><label>Full Name *</label><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div><label>Phone (Login) *</label><input className="inp" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required /></div>
              <div><label>Password *</label><input className="inp" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required /></div>
              <div>
                <label>Role</label>
                <select className="inp" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="STAFF">Staff</option>
                  <option value="STORE_ADMIN">Store Admin</option>
                  {user?.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
                </select>
              </div>
            </div>
            <button className="btn btn-brand btn-sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Staff'}</button>
          </form>
        </div>
      )}

      {loading && <div className="loading">Loading staff…</div>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Store</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {(staff ?? []).length === 0 && (
                  <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>No staff yet.</td></tr>
                )}
                {(staff ?? []).map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.phone}</td>
                    <td>
                      <span className={`chip chip-${s.role === 'SUPER_ADMIN' ? 'red' : s.role === 'STORE_ADMIN' ? 'amber' : 'blue'}`}>
                        {s.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{s.storeName ?? '—'}</td>
                    <td>
                      <span className={`chip chip-${s.isActive ? 'green' : 'gray'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(s.id)}>
                          {s.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    )}
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

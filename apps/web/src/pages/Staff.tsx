import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { StaffMember } from '@fc-sms/types';
import { useAuth } from '../hooks/useAuth';

interface Store { id: string; name: string; city: string; }

export default function Staff() {
  const { user } = useAuth();
  const { data: staff, loading, error, refetch } = useFetch<StaffMember[]>('/staff');
  const { data: stores } = useFetch<Store[]>('/stores', undefined, { skip: user?.role !== 'SUPER_ADMIN' });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '', role: 'STAFF', storeId: '' });
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', password: '', role: '' });
  const [editSaving, setEditSaving] = useState(false);

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'STORE_ADMIN';

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.storeId) delete payload.storeId;
      await api.post('/staff', payload);
      setForm({ name: '', phone: '', password: '', role: 'STAFF', storeId: '' });
      setAdding(false);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(s: StaffMember) {
    setEditingId(s.id);
    setEditForm({ name: s.name, password: '', role: s.role });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    try {
      const payload: any = {};
      if (editForm.name) payload.name = editForm.name;
      if (editForm.password) payload.password = editForm.password;
      if (user?.role === 'SUPER_ADMIN' && editForm.role) payload.role = editForm.role;
      await api.patch(`/staff/${editingId}`, payload);
      setEditingId(null);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Update failed');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(id: string) {
    try {
      await api.patch(`/staff/${id}/toggle`);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Update failed');
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
          <button className="btn btn-brand" onClick={() => { setAdding(a => !a); setEditingId(null); }}>
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
              {user?.role === 'SUPER_ADMIN' && stores && stores.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Assign to Store</label>
                  <select className="inp" value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
                    <option value="">— My store (default) —</option>
                    {stores.map(st => (
                      <option key={st.id} value={st.id}>{st.name} ({st.city})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button className="btn btn-brand btn-sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Staff'}</button>
          </form>
        </div>
      )}

      {editingId && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--brand)' }}>
          <div className="card-title">Edit Staff</div>
          <form onSubmit={saveEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 12 }}>
              <div>
                <label>Full Name</label>
                <input className="inp" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label>New Password <span style={{ color: 'var(--text2)', fontWeight: 400 }}>(leave blank to keep current)</span></label>
                <input className="inp" type="password" placeholder="••••••••" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              {user?.role === 'SUPER_ADMIN' && (
                <div>
                  <label>Role</label>
                  <select className="inp" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="STAFF">Staff</option>
                    <option value="STORE_ADMIN">Store Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-brand btn-sm" type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
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
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => editingId === s.id ? setEditingId(null) : startEdit(s)}
                          style={{ minWidth: 48 }}
                        >
                          {editingId === s.id ? 'Close' : 'Edit'}
                        </button>
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

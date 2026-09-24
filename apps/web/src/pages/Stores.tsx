import React, { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { Store } from '@fc-sms/types';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

interface StoreWithStats extends Store {
  _count?: { loads: number; members: number; staff: number };
}

export default function Stores() {
  const { user } = useAuth();
  const { data: stores, loading, error, refetch } = useFetch<StoreWithStats[]>('/stores');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', city: '', state: '', phone: '' });
  const [saving, setSaving] = useState(false);

  if (user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  async function addStore(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/stores', form);
      setForm({ name: '', code: '', city: '', state: '', phone: '' });
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
          <div className="page-title">Stores</div>
          <div className="page-sub">{(stores ?? []).length} store(s) — Super Admin view</div>
        </div>
        <button className="btn btn-brand" onClick={() => setAdding(a => !a)}>
          {adding ? '✕ Cancel' : '+ Add Store'}
        </button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Add New Store</div>
          <form onSubmit={addStore}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: '1/3' }}><label>Store Name *</label><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="FC @ City - Area" /></div>
              <div><label>Store Code *</label><input className="inp" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required placeholder="LKO-CHOWK" /></div>
              <div><label>City</label><input className="inp" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div><label>State</label><input className="inp" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} /></div>
              <div><label>Phone</label><input className="inp" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <button className="btn btn-brand btn-sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Store'}</button>
          </form>
        </div>
      )}

      {loading && <div className="loading">Loading stores…</div>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {(stores ?? []).map(store => (
            <div key={store.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{store.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{store.code}</div>
                </div>
                <span className={`chip chip-${store.isActive ? 'green' : 'gray'}`}>
                  {store.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {(store.city || store.state) && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                  {[store.city, store.state].filter(Boolean).join(', ')}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {[
                  { label: 'Loads', val: store._count?.loads ?? 0 },
                  { label: 'Members', val: store._count?.members ?? 0 },
                  { label: 'Staff', val: store._count?.staff ?? 0 },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: 6, padding: '8px 4px' }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

import React from 'react';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';

interface DashStats {
  totalLoads: number;
  openLoads: number;
  catalogItems: number;
  openAudits: number;
  openSRs: number;
  totalMembers: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, loading } = useFetch<DashStats>('/dashboard/stats');

  const s = stats ?? { totalLoads: 0, openLoads: 0, catalogItems: 0, openAudits: 0, openSRs: 0, totalMembers: 0 };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Welcome, {user?.name}</div>
          <div className="page-sub">{user?.storeName}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading stats…</div>
      ) : (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total Loads</div>
            <div className="stat-val">{s.totalLoads}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open Loads</div>
            <div className="stat-val" style={{ color: s.openLoads ? 'var(--amber)' : 'inherit' }}>
              {s.openLoads}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Catalog Items</div>
            <div className="stat-val">{s.catalogItems}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open Audits</div>
            <div className="stat-val" style={{ color: s.openAudits ? 'var(--amber)' : 'inherit' }}>
              {s.openAudits}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open SRs</div>
            <div className="stat-val">{s.openSRs}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Members</div>
            <div className="stat-val">{s.totalMembers}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 0 }}>
        <div className="card-title">Quick Links</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { href: '/import',  label: '📥 Import Stock' },
            { href: '/stock',   label: '📦 View Stock' },
            { href: '/match',   label: '🔍 Match Stock' },
            { href: '/catalog', label: '📋 Catalog' },
            { href: '/audits',  label: '✅ Audit' },
            { href: '/billing', label: '🧾 Manual Bill' },
            { href: '/sr',      label: '↩️ Stock Return' },
          ].map(l => (
            <a key={l.href} href={l.href} className="btn btn-ghost">
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

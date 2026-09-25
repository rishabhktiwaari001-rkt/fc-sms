import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';

interface StoreProfile {
  gstin: string;
  legalName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
}

const NAV = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { section: 'INWARD' },
  { path: '/import',   icon: '📥', label: 'Import Stock' },
  { path: '/match',    icon: '🔍', label: 'Match Stock' },
  { path: '/stock',    icon: '📦', label: 'View Stock' },
  { section: 'INVENTORY' },
  { path: '/catalog',  icon: '📋', label: 'Catalog' },
  { path: '/audits',   icon: '✅', label: 'Audit' },
  { section: 'OPERATIONS' },
  { path: '/billing',  icon: '🧾',  label: 'Manual Billing' },
  { path: '/sr',       icon: '↩️',  label: 'Stock Return' },
  { path: '/eoss',     icon: '🏷️',  label: 'EOSS' },
  { path: '/members',  icon: '👥', label: 'Members' },
  { section: 'ADMIN' },
  { path: '/staff',    icon: '👤', label: 'Staff' },
  { path: '/stores',   icon: '🏪', label: 'Stores', superOnly: true },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/import':    'Import Stock',
  '/stock':     'View Stock',
  '/match':     'Match Stock',
  '/catalog':   'Catalog',
  '/audits':    'Audit',
  '/billing':   'Manual Billing',
  '/sr':        'Stock Return',
  '/eoss':      'EOSS',
  '/members':   'Members',
  '/staff':     'Staff',
  '/stores':    'Stores',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const { data: storeProfile } = useFetch<StoreProfile>('/billing/store-profile');

  const currentPath = '/' + location.pathname.split('/')[1];
  const pageTitle = PAGE_TITLES[currentPath] ?? 'Franchise Retail Management';

  const displayName = storeProfile?.tradeName || storeProfile?.legalName || user?.storeName || 'Store Management';
  const displayAddr = [storeProfile?.city, storeProfile?.state].filter(Boolean).join(', ');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-name">Franchise Retail Management</div>
          <div className="sidebar-store">{displayName}</div>
          {displayAddr && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.4 }}>
              📍 {displayAddr}
            </div>
          )}
          {storeProfile?.gstin && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, letterSpacing: '0.3px' }}>
              GSTIN: {storeProfile.gstin}
            </div>
          )}
        </div>

        <nav>
          {NAV.map((item, i) => {
            if ('section' in item) {
              return <div key={i} className="nav-section-label">{item.section}</div>;
            }
            if (item.superOnly && user?.role !== 'SUPER_ADMIN') return null;
            const active = currentPath === item.path;
            return (
              <button
                key={item.path}
                className={`nav-item${active ? ' active' : ''}`}
                onClick={() => navigate(item.path!)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
            {user?.name}<br />
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{user?.role}</span>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">{pageTitle}</span>
        </header>
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}

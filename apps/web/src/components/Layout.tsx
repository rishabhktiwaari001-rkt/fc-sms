import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';

interface StoreProfile {
  gstin: string; legalName: string; tradeName: string;
  address: string; city: string; state: string; pincode: string; phone: string;
}

const NAV = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { section: 'INWARD' },
  { path: '/import',   icon: '📥', label: 'Import Stock' },
  { path: '/match',    icon: '🔍', label: 'Match Stock' },
  { path: '/stock',    icon: '📦', label: 'View Stock' },
  { section: 'INVENTORY' },
  { path: '/catalog',    icon: '📋', label: 'Catalog' },
  { path: '/audits',     icon: '✅', label: 'Audit' },
  { path: '/storeroom',  icon: '🏠', label: 'Store Room' },
  { section: 'OPERATIONS' },
  { path: '/cashbook', icon: '💰', label: 'Cashbook' },
  { path: '/billing',  icon: '🧾', label: 'Manual Billing' },
  { path: '/sr',       icon: '↩️', label: 'Stock Return' },
  { path: '/eoss',     icon: '🏷️', label: 'EOSS' },
  { path: '/members',  icon: '👥', label: 'Members' },
  { path: '/pod',      icon: '📚', label: 'POD Training' },
  { path: '/matrix',   icon: '📊', label: 'Retail Matrix' },
  { section: 'ADMIN' },
  { path: '/staff',    icon: '👤', label: 'Staff' },
  { path: '/stores',   icon: '🏪', label: 'Stores', superOnly: true },
];

// Bottom nav — 4 most-used + More
const BOTTOM_NAV = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { path: '/cashbook',  icon: '💰', label: 'Cashbook'  },
  { path: '/stock',     icon: '📦', label: 'Stock'     },
  { path: '/billing',   icon: '🧾', label: 'Billing'   },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',    '/import':   'Import Stock',
  '/stock':     'View Stock',   '/match':    'Match Stock',
  '/catalog':   'Catalog',      '/audits':   'Audit',
  '/cashbook':  'Cashbook',     '/billing':  'Manual Billing',
  '/sr':        'Stock Return', '/eoss':     'EOSS',
  '/members':   'Members',      '/pod':      'POD Training',
  '/matrix':    'Retail Matrix','/staff':    'Staff',
  '/stores':    'Stores',   '/storeroom': 'Store Room',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: storeProfile } = useFetch<StoreProfile>('/billing/store-profile');

  const currentPath  = '/' + location.pathname.split('/')[1];
  const pageTitle    = PAGE_TITLES[currentPath] ?? 'Franchise Retail Management';
  const displayName  = storeProfile?.tradeName || storeProfile?.legalName || user?.storeName || 'Store';
  const displayAddr  = [storeProfile?.city, storeProfile?.state].filter(Boolean).join(', ');

  function goTo(path: string) { navigate(path); setDrawerOpen(false); }

  const sidebarContent = (
    <>
      <div className="sidebar-brand">
        <div className="sidebar-brand-name">Franchise Retail Management</div>
        <div className="sidebar-store">{displayName}</div>
        {displayAddr && (
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:2, lineHeight:1.4 }}>📍 {displayAddr}</div>
        )}
        {storeProfile?.gstin && (
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:2, letterSpacing:'0.3px' }}>GSTIN: {storeProfile.gstin}</div>
        )}
      </div>

      <nav style={{ flex:1, overflowY:'auto' }}>
        {NAV.map((item, i) => {
          if ('section' in item) return <div key={i} className="nav-section-label">{item.section}</div>;
          if (item.superOnly && user?.role !== 'SUPER_ADMIN') return null;
          const active = currentPath === item.path;
          return (
            <button key={item.path} className={`nav-item${active ? ' active' : ''}`} onClick={() => goTo(item.path!)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding:'16px', borderTop:'1px solid rgba(255,255,255,0.07)', marginTop:8 }}>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:8 }}>
          {user?.name}<br />
          <span style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px' }}>{user?.role}</span>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ width:'100%' }} onClick={logout}>Sign Out</button>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar sidebar-desktop">{sidebarContent}</aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}
      <aside className={`sidebar sidebar-drawer${drawerOpen ? ' open' : ''}`}>
        <button className="drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        {sidebarContent}
      </aside>

      {/* ── Main area ── */}
      <div className="main-area">
        <header className="topbar">
          {/* Hamburger — mobile only */}
          <button className="hamburger" onClick={() => setDrawerOpen(true)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <span className="topbar-title">{pageTitle}</span>
          <span style={{ fontSize:12, color:'var(--text2)', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:11 }}>👤</span>{user?.name}
          </span>
        </header>

        <main className="page-content">
          {children}
        </main>

        {/* ── Mobile bottom nav ── */}
        <nav className="bottom-nav">
          {BOTTOM_NAV.map(item => {
            const active = currentPath === item.path;
            return (
              <button key={item.path} className={`bottom-nav-item${active ? ' active' : ''}`} onClick={() => goTo(item.path)}>
                <span style={{ fontSize:20 }}>{item.icon}</span>
                <span style={{ fontSize:10, marginTop:2 }}>{item.label}</span>
              </button>
            );
          })}
          <button className={`bottom-nav-item${!BOTTOM_NAV.find(n=>n.path===currentPath) ? ' active' : ''}`}
            onClick={() => setDrawerOpen(true)}>
            <span style={{ fontSize:20 }}>☰</span>
            <span style={{ fontSize:10, marginTop:2 }}>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

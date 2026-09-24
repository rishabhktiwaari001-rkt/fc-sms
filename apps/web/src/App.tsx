import React, { useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, createAuthValue } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './pages/Login';

// Lazy-load pages
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import ViewStock from './pages/ViewStock';
import MatchStock from './pages/MatchStock';
import Catalog from './pages/Catalog';
import Audits from './pages/Audits';
import AuditDetail from './pages/AuditDetail';
import StockReturn from './pages/StockReturn';
import EOSS from './pages/EOSS';
import Members from './pages/Members';
import Staff from './pages/Staff';
import Stores from './pages/Stores';
import LoadDetail from './pages/LoadDetail';
import ManualBilling from './pages/ManualBilling';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('fc_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [tick, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick(t => t + 1), []);
  const authValue = createAuthValue(forceUpdate);

  return (
    <AuthContext.Provider value={authValue}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="import" element={<Import />} />
                  <Route path="stock" element={<ViewStock />} />
                  <Route path="stock/:id" element={<LoadDetail />} />
                  <Route path="match" element={<MatchStock />} />
                  <Route path="catalog" element={<Catalog />} />
                  <Route path="audits" element={<Audits />} />
                  <Route path="audits/:id" element={<AuditDetail />} />
                  <Route path="sr" element={<StockReturn />} />
                  <Route path="eoss" element={<EOSS />} />
                  <Route path="billing" element={<ManualBilling />} />
                  <Route path="members" element={<Members />} />
                  <Route path="staff" element={<Staff />} />
                  <Route path="stores" element={<Stores />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthContext.Provider>
  );
}

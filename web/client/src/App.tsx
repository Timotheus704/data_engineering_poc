import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Ship, Car, Shield, LayoutDashboard, Database } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import TitanicPage from './pages/TitanicPage';
import TaxiPage from './pages/TaxiPage';
import AdminPage from './pages/AdminPage';

const nav = [
  { to: '/',        label: 'Dashboard',  Icon: LayoutDashboard },
  { to: '/titanic', label: 'Titanic',    Icon: Ship },
  { to: '/taxi',    label: 'NYC Taxi',   Icon: Car },
  { to: '/admin',   label: 'Admin',      Icon: Shield },
];

export default function App() {
  const { pathname } = useLocation();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#161b27', borderRight: '1px solid #1e2a3a', display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #1e2a3a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={20} color="#3b82f6" />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>PoC Platform</span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Data Dashboard</div>
        </div>
        <nav style={{ padding: '16px 12px', flex: 1 }}>
          {nav.map(({ to, label, Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8, marginBottom: 4,
                  background: active ? '#1e3a5f' : 'transparent',
                  color: active ? '#60a5fa' : '#94a3b8',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}>
                  <Icon size={16} />
                  {label}
                </div>
              </NavLink>
            );
          })}
        </nav>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2a3a', fontSize: 11, color: '#475569' }}>
          API: <a href="http://localhost:3001/docs" target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>Swagger Docs</a>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/titanic" element={<TitanicPage />} />
          <Route path="/taxi"    element={<TaxiPage />} />
          <Route path="/admin"   element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}

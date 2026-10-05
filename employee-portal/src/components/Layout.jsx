import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CommandPalette from './CommandPalette';
import HistoryNav from './HistoryNav';
import NotificationBell from './NotificationBell';
import CloseTabGuard from './CloseTabGuard';

const THEME_KEY = 'ems_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export default function Layout({ title, links, actions = [], employeeHref, departmentHref }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Appinop</strong>
          <span>{title}</span>
        </div>
        <nav className="nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.85rem', opacity: 0.85 }}>
          <div>{user?.profile?.name || user?.email}</div>
          <div style={{ opacity: 0.7 }}>{user?.employeeId}</div>
        </div>
        <button
          className="btn ghost"
          style={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          Logout
        </button>
      </aside>
      <main className="main">
        <div className="shell-toolbar">
          <HistoryNav />
          <button type="button" className="shell-search" onClick={() => setPaletteOpen(true)}>
            Search or jump to a page
            <kbd>Ctrl K</kbd>
          </button>
          <NotificationBell />
          <button
            type="button"
            className="shell-icon-btn"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
        <CloseTabGuard />
        <Outlet />
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={actions}
        employeeHref={employeeHref}
        departmentHref={departmentHref}
      />
    </div>
  );
}

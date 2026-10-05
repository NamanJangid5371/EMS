import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import AttendancePage from './pages/AttendancePage';
import LeavesPage from './pages/LeavesPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import SettingsPage from './pages/SettingsPage';
import CompanyCalendarPage from './pages/CompanyCalendarPage';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/profile', label: 'My Profile' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/leaves', label: 'Leave' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/settings', label: 'Settings' },
];

const paletteActions = [
  { label: 'My Profile', href: '/profile', hint: 'Account' },
  { label: 'Attendance', href: '/attendance', hint: 'Check in' },
  { label: 'Leaves', href: '/leaves', hint: 'Balance' },
  { label: 'Notifications', href: '/', hint: 'Inbox' },
  { label: 'Settings', href: '/settings', hint: 'Account' },
];

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    const to = next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login';
    return <Navigate to={to} replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginPage portalLabel="Employee Portal" />
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Layout
                title="Employee Portal"
                links={links}
                actions={paletteActions}
                employeeHref={() => '/profile'}
                departmentHref={() => '/profile'}
              />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="leaves" element={<LeavesPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="calendar" element={<CompanyCalendarPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

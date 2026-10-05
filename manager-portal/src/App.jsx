import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TeamPage from './pages/TeamPage';
import EmployeeProfilePage from './pages/EmployeeProfilePage';
import AttendancePage from './pages/AttendancePage';
import LeavesPage from './pages/LeavesPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import SettingsPage from './pages/SettingsPage';
import TasksPage from './pages/TasksPage';
import CompanyCalendarPage from './pages/CompanyCalendarPage';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/team', label: 'My Team' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/tasks', label: 'Assign Tasks' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/leaves', label: 'Leaves' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/settings', label: 'Settings' },
];

const paletteActions = [
  { label: 'My Team', href: '/team', hint: 'People' },
  { label: 'Attendance', href: '/attendance', hint: 'Time' },
  { label: 'Leaves', href: '/leaves', hint: 'Approvals' },
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
            <LoginPage portalLabel="Manager Portal" />
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Layout
                title="Manager Portal"
                links={links}
                actions={paletteActions}
                employeeHref={(id) => `/team/${id}`}
                departmentHref={() => '/team'}
              />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="team/:id" element={<EmployeeProfilePage />} />
          <Route path="calendar" element={<CompanyCalendarPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="leaves" element={<LeavesPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

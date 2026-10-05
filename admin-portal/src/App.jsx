import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeProfilePage from './pages/EmployeeProfilePage';
import DepartmentsPage from './pages/DepartmentsPage';
import DepartmentDetailPage from './pages/DepartmentDetailPage';
import LeavesPage from './pages/LeavesPage';
import AttendancePage from './pages/AttendancePage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import TasksPage from './pages/TasksPage';
import HireRequestsPage from './pages/HireRequestsPage';
import HireRequestDetailPage from './pages/HireRequestDetailPage';
import OrganizationPage from './pages/OrganizationPage';
import CompanyCalendarPage from './pages/CompanyCalendarPage';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/employees', label: 'Employees' },
  { to: '/hire-requests', label: 'Hire Requests' },
  { to: '/departments', label: 'Departments' },
  { to: '/organization', label: 'Organization' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/tasks', label: 'Assign Tasks' },
  { to: '/leaves', label: 'Leaves' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/reports', label: 'Reports' },
  { to: '/audit', label: 'Audit Logs' },
  { to: '/settings', label: 'Settings' },
];

const paletteActions = [
  { label: 'Add Employee', href: '/employees', hint: 'People' },
  { label: 'Attendance', href: '/attendance', hint: 'Time' },
  { label: 'Leaves', href: '/leaves', hint: 'Approvals' },
  { label: 'Reports', href: '/reports', hint: 'Analytics' },
  { label: 'Notifications', href: '/', hint: 'Inbox' },
  { label: 'Settings', href: '/settings', hint: 'Admin' },
  { label: 'Organization', href: '/organization', hint: 'Hierarchy' },
  { label: 'Calendar', href: '/calendar', hint: 'Events' },
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
            <LoginPage portalLabel="Admin Portal" />
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Layout title="Admin Portal" links={links} actions={paletteActions} />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<Navigate to="/employees" replace />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="employees/:id" element={<EmployeeProfilePage />} />
          <Route path="hire-requests" element={<HireRequestsPage />} />
          <Route path="hire-requests/:id" element={<HireRequestDetailPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="departments/:id" element={<DepartmentDetailPage />} />
          <Route path="organization" element={<OrganizationPage />} />
          <Route path="calendar" element={<CompanyCalendarPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="leaves" element={<LeavesPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

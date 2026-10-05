import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AttendanceCircleChart, DonutChart } from '../components/Charts';
import EmployeeNameLink from '../components/EmployeeNameLink';

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString() : '—';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function formatHours(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(2)}h`;
}

function statusLabel(status) {
  if (status === 'present') return 'full day';
  return String(status || '—').replace(/_/g, ' ');
}

function AttendancePeopleTable({ title, hint, rows, emptyText, showRole = true }) {
  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>{title}</h3>
      {hint ? (
        <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>{hint}</p>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              {showRole ? <th>Role</th> : null}
              <th>Date</th>
              <th>Login time</th>
              <th>Logout time</th>
              <th>Work hours</th>
              <th>Overtime</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id}>
                <td><EmployeeNameLink employee={row.employeeId} /></td>
                {showRole ? (
                  <td><span className="badge">{row.employeeId?.userId?.role || '—'}</span></td>
                ) : null}
                <td>{formatDate(row.date)}</td>
                <td>{row.checkIn ? formatTime(row.checkIn) : '—'}</td>
                <td>
                  {row.checkIn
                    ? (row.checkOut ? formatTime(row.checkOut) : 'Still logged in')
                    : '—'}
                </td>
                <td>{row.checkOut ? formatHours(row.workHours) : '—'}</td>
                <td>{(row.overtimeHours || 0) > 0 ? formatHours(row.overtimeHours) : '—'}</td>
                <td>
                  <span className={`badge ${row.status}`}>{statusLabel(row.status)}</span>
                  {row.notes && (row.status === 'on_leave' || row.status === 'absent') ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>{row.notes}</div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="empty">{emptyText}</div> : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, []);

  const stats = data?.stats || {};
  const charts = data?.charts || {};
  const todayLogins = data?.todayLogins || [];
  const todayAbsent = data?.todayAbsent || [];
  const todayOnLeave = data?.todayOnLeave || [];
  const alerts = data?.alerts || [];

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Command center for people, attendance, leave, and today&apos;s exceptions</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      <div className="panel command-center">
        <h3>What needs my attention?</h3>
        <p className="muted" style={{ marginBottom: '0.85rem' }}>Click an alert to open the matching page</p>
        {alerts.length ? (
          <div className="alert-grid">
            {alerts.map((alert) => (
              <Link key={alert.id} className={`attention-card ${alert.kind}`} to={alert.href}>
                <div className="attention-count">{alert.count}</div>
                <div>
                  <strong>{alert.title}</strong>
                  <div className="muted">
                    {(alert.items || []).slice(0, 3).map((item) => item.label).join(', ') || 'Open list'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">Nothing urgent right now</div>
        )}
      </div>

      <div className="grid stats">
        {[
          ['Employees', stats.employees],
          ['Managers', stats.managers],
          ['Departments', stats.departments],
          ['Pending leaves today', stats.pendingLeaves],
          ['On leave today', stats.onLeaveToday ?? stats.approvedLeaves],
          ['Absent today', stats.absentToday],
          ['Present today', stats.presentToday],
          ['Full day', stats.fullDayToday],
          ['Late', stats.lateToday],
          ['Half day', stats.halfDayToday],
          ['OT people', stats.overtimeToday],
          ['OT hours', stats.overtimeHoursToday != null ? formatHours(stats.overtimeHoursToday) : '—'],
          ['Open tasks', stats.openTasks],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value ?? '—'}</div>
          </div>
        ))}
      </div>

      <AttendancePeopleTable
        title="Login / logout today (employees & managers)"
        hint="Rules: office 10:00–19:00 (9h) · 30 min buffer (in by 10:30 / up to 9h30m = no OT) · extra after that = overtime · under 6h = half day"
        rows={todayLogins}
        emptyText="No logins recorded today"
      />
      <AttendancePeopleTable
        title="On leave today"
        hint="Approved leave covering today · same login/logout columns as above"
        rows={todayOnLeave}
        emptyText="Nobody is on leave today"
      />
      <AttendancePeopleTable
        title="Absent today"
        hint="Active employees and managers with no login today (weekends are office off)"
        rows={todayAbsent}
        emptyText="Nobody is absent today"
      />

      <div className="charts-grid">
        <DonutChart
          title="Workforce mix"
          items={charts.workforce}
          emptyText="No workforce data yet"
        />
        <DonutChart
          title="Leave status today"
          items={charts.leaveByStatus}
          showZeros
          emptyText="No leave covering today"
        />
        <AttendanceCircleChart
          title="Attendance today"
          items={charts.attendanceToday}
          meta={charts.attendanceMeta}
          emptyText="No attendance marked today"
        />
      </div>
    </div>
  );
}

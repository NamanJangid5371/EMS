import { useEffect, useState } from 'react';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import DashboardAttendanceCalendar from '../components/DashboardAttendanceCalendar';

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

function initials(name) {
  return String(name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'A';
}

function ManagerIntroCard({ profile }) {
  const name = profile?.name || 'Manager';
  const department = profile?.departmentId?.name || '—';
  return (
    <div className="intro-card">
      <div className="intro-card-avatar" aria-hidden="true">{initials(name)}</div>
      <div className="intro-card-body">
        <h2>{name}</h2>
        <p className="intro-card-meta">
          <span>Department</span>
          <strong>{department}</strong>
        </p>
      </div>
    </div>
  );
}

function AttendancePeopleTable({ title, hint, rows, emptyText }) {
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
  const [message, setMessage] = useState('');

  async function load() {
    const res = await api('/dashboard');
    setData(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function markDone(taskId) {
    setError('');
    setMessage('');
    try {
      await api(`/tasks/${taskId}/status`, { method: 'PATCH', body: { status: 'completed' } });
      setMessage('Task marked as completed');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const stats = data?.stats || {};
  const tasks = data?.tasks || [];
  const todayLogins = data?.todayLogins || [];
  const todayAbsent = data?.todayAbsent || [];
  const todayOnLeave = data?.todayOnLeave || [];
  const myAttendance = data?.myAttendance;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Manager Dashboard</h1>
          <p>Team health, attendance, and tasks assigned to you</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}
      <ManagerIntroCard profile={data?.profile} />
      <div className="grid stats">
        {[
          ['Team size', stats.teamSize],
          ['Present today', stats.presentToday],
          ['Absent today', stats.absentToday],
          ['On leave today', stats.onLeaveToday],
          ['Present rate', stats.presentRate != null ? `${stats.presentRate}%` : '—'],
          ['Full day', stats.fullDayToday],
          ['Late', stats.lateToday],
          ['Half day', stats.halfDayToday],
          ['OT people', stats.overtimeToday],
          ['OT hours', stats.overtimeHoursToday != null ? formatHours(stats.overtimeHoursToday) : '—'],
          ['Pending leaves', stats.pendingLeaves],
          ['My open tasks', stats.openTasks],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value ?? '—'}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginTop: '1rem', flexWrap: 'wrap' }}>
        <div className="panel cal-box">
          <h3 style={{ marginBottom: '0.2rem', fontSize: '1rem' }}>My attendance</h3>
          <p className="muted" style={{ marginBottom: '0.35rem', fontSize: '0.72rem' }}>
            Green attended · Red leave · Orange holiday · Grey absent
          </p>
          <DashboardAttendanceCalendar />
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 240 }}>
          <h3 style={{ marginBottom: '0.35rem' }}>My attendance today</h3>
          {myAttendance ? (
            <>
              <p>
                Status: <span className={`badge ${myAttendance.status}`}>{statusLabel(myAttendance.status)}</span>
              </p>
              <p>
                Login {formatTime(myAttendance.checkIn)} · Logout{' '}
                {myAttendance.checkOut ? formatTime(myAttendance.checkOut) : 'still in'}
              </p>
              <p>
                Work hours: {myAttendance.checkOut ? formatHours(myAttendance.workHours) : 'pending logout'}
                {(myAttendance.overtimeHours || 0) > 0 ? ` · Overtime: ${formatHours(myAttendance.overtimeHours)}` : ''}
              </p>
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Full day: 10:00–19:00 (9h) · 30 min buffer · Late after 10:30 · Half day under 6h · Extra after 9h30m = OT · Please logout before closing the tab
              </p>
              <div className="row-actions" style={{ marginTop: '0.85rem' }}>
                <button
                  className="btn"
                  type="button"
                  disabled={Boolean(myAttendance?.checkIn && myAttendance?.checkOut)}
                  onClick={async () => {
                    setError('');
                    setMessage('');
                    try {
                      const res = await api('/attendance/mark', { method: 'POST', body: {} });
                      setMessage(res.message || 'Attendance updated');
                      await load();
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                >
                  {myAttendance?.checkIn && !myAttendance?.checkOut ? 'Check out' : 'Check in'}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">No attendance yet — recorded on your login/logout.</p>
          )}
        </div>
      </div>

      <AttendancePeopleTable
        title="Team login / logout today"
        hint="Full day: 10:00–19:00 with 30 min buffer · Late after 10:30 · Half day under 6h · Extra after 9h30m = OT"
        rows={todayLogins}
        emptyText="No team logins recorded today"
      />
      <AttendancePeopleTable
        title="Team on leave today"
        hint="Approved leave covering today"
        rows={todayOnLeave}
        emptyText="Nobody on your team is on leave today"
      />
      <AttendancePeopleTable
        title="Team absent today"
        hint="Team members with no login today (weekends are office off)"
        rows={todayAbsent}
        emptyText="Nobody on your team is absent today"
      />

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>My assigned tasks</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project name</th>
                <th>Task</th>
                <th>Deadline</th>
                <th>Date assigned</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task._id}>
                  <td>{task.projectName}</td>
                  <td>{task.title}</td>
                  <td>{new Date(task.deadline).toLocaleDateString()}</td>
                  <td>{new Date(task.assignedAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn secondary" onClick={() => markDone(task._id)}>
                      Mark done
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tasks.length ? <div className="empty">No tasks assigned to you by Admin</div> : null}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import DashboardAttendanceCalendar from '../components/DashboardAttendanceCalendar';

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString() : '—';
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

function IdentityCard({ profile }) {
  if (!profile) return null;
  return (
    <div className="identity-card">
      <div className="identity-avatar" aria-hidden="true">{initials(profile.name)}</div>
      <div className="identity-main">
        <h2>{profile.name || '—'}</h2>
        <p>
          {profile.designation || 'Employee'}
          {profile.employeeId ? ` · ${profile.employeeId}` : ''}
        </p>
      </div>
      <div className="identity-meta">
        <div>
          <span>Department</span>
          <strong>{profile.departmentId?.name || '—'}</strong>
        </div>
        <div>
          <span>Assigned manager</span>
          <strong>{profile.managerId?.name || 'Not assigned'}</strong>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [completingTask, setCompletingTask] = useState(null);
  const [completionNote, setCompletionNote] = useState('');

  async function load() {
    const res = await api('/dashboard');
    setData(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function startComplete(task) {
    setError('');
    setMessage('');
    setCompletingTask(task);
    setCompletionNote('');
  }

  function cancelComplete() {
    setCompletingTask(null);
    setCompletionNote('');
  }

  async function markTaskDone(taskId) {
    setError('');
    setMessage('');
    try {
      await api(`/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: {
          status: 'completed',
          completionNote: completionNote.trim(),
        },
      });
      setCompletingTask(null);
      setCompletionNote('');
      setMessage('Task marked as completed');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const stats = data?.stats || {};
  const balance = stats.leaveBalance || {};
  const tasks = data?.tasks || [];
  const today = stats.todayAttendance;
  const recentLeaves = data?.recentLeaves || [];

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>My Dashboard</h1>
          <p>Welcome back{data?.profile?.name ? `, ${data.profile.name}` : ''}</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}
      <IdentityCard profile={data?.profile} />
      <div className="grid stats">
        <div className="stat">
          <div className="label">Annual leave</div>
          <div className="value">{balance.annual ?? '—'}</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
        </div>
        <div className="stat">
          <div className="label">Sick leave</div>
          <div className="value">{balance.sick ?? '—'}</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
        </div>
        <div className="stat">
          <div className="label">Casual leave</div>
          <div className="value">{balance.casual ?? '—'}</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
        </div>
        <div className="stat">
          <div className="label">Open tasks</div>
          <div className="value">{stats.openTasks ?? tasks.length ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="label">Today status</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>
            {today ? statusLabel(today.status) : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Overtime this month</div>
          <div className="value">{formatHours(stats.overtimeHoursThisMonth)}</div>
        </div>
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
          <h3>Today (login / logout)</h3>
          {today ? (
            <>
              <p>
                Status: <span className={`badge ${today.status}`}>{statusLabel(today.status)}</span>
              </p>
              <p>
                Login {formatTime(today.checkIn)} · Logout{' '}
                {today.checkOut ? formatTime(today.checkOut) : 'still in'}
              </p>
              <p>
                Work hours: {today.checkOut ? formatHours(today.workHours) : 'pending logout'}
                {(today.overtimeHours || 0) > 0 ? ` · Overtime: ${formatHours(today.overtimeHours)}` : ''}
              </p>
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Full day: 10:00–19:00 (9h) · 30 min buffer · Late after 10:30 · Half day under 6h · Extra after 9h30m = OT · Please logout before closing the tab
              </p>
              <div className="row-actions" style={{ marginTop: '0.85rem' }}>
                <button
                  className="btn"
                  type="button"
                  disabled={Boolean(today?.checkIn && today?.checkOut)}
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
                  {today?.checkIn && !today?.checkOut ? 'Check out' : 'Check in'}
                </button>
              </div>
            </>
          ) : (
            <p>Will record when you log in / log out</p>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Leave status</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {recentLeaves.map((l) => (
                <tr key={l._id}>
                  <td>{l.type}</td>
                  <td>
                    {new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}
                  </td>
                  <td><span className={`badge ${l.status}`}>{l.status}</span></td>
                  <td>
                    {l.status === 'pending'
                      ? 'Awaiting manager'
                      : `${l.status} by ${
                          l.approvedBy?.employeeProfile?.name
                          || (l.approvedBy?.role === 'admin' ? 'Admin' : l.approvedBy?.email)
                          || 'manager'
                        }`}
                    {l.decisionAt ? (
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        {new Date(l.decisionAt).toLocaleString()}
                      </div>
                    ) : null}
                    {l.decisionNote ? (
                      <div className="muted" style={{ fontSize: '0.82rem' }}>Comment: {l.decisionNote}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recentLeaves.length ? <div className="empty">No leave requests yet</div> : null}
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Assigned tasks</h3>
        {completingTask ? (
          <div className="panel" style={{ marginBottom: '1rem', background: 'var(--brand-soft)' }}>
            <h3 style={{ marginBottom: '0.35rem' }}>Mark project done</h3>
            <p style={{ marginBottom: '0.75rem' }}>
              {completingTask.projectName} · {completingTask.title}
            </p>
            <div className="field">
              <label>Completion note (optional)</label>
              <textarea
                rows={3}
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Add a note about this project before marking it done"
              />
            </div>
            <div className="row-actions" style={{ marginTop: '0.75rem' }}>
              <button className="btn" type="button" onClick={() => markTaskDone(completingTask._id)}>
                Mark as done
              </button>
              <button className="btn ghost" type="button" onClick={cancelComplete}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
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
                  <td>
                    <div>{task.title}</div>
                    {task.description ? (
                      <div className="muted" style={{ fontSize: '0.82rem' }}>{task.description}</div>
                    ) : null}
                  </td>
                  <td>{new Date(task.deadline).toLocaleDateString()}</td>
                  <td>{new Date(task.assignedAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn secondary" type="button" onClick={() => startComplete(task)}>
                      Mark done
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tasks.length ? <div className="empty">No tasks assigned yet</div> : null}
        </div>
      </div>
    </div>
  );
}

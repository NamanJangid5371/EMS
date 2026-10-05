import { useEffect, useState } from 'react';
import { api } from '../api/client';

function formatHours(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(2)}h`;
}

function statusLabel(status) {
  if (status === 'present') return 'full day';
  return String(status || '—').replace(/_/g, ' ');
}

export default function AttendancePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api('/attendance');
    setItems(res.data.items || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const today = items.find((row) => new Date(row.date).toDateString() === new Date().toDateString());
  const completed = items.filter((row) => row.checkOut);
  const avgHours = completed.length
    ? (completed.reduce((sum, row) => sum + (Number(row.workHours) || 0), 0) / completed.length).toFixed(2)
    : '0.00';
  const presentRate = items.length
    ? Math.round((items.filter((row) => ['present', 'late', 'half_day'].includes(row.status)).length / items.length) * 100)
    : 0;

  async function punch() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await api('/attendance/mark', { method: 'POST', body: {} });
      setMessage(res.message || 'Attendance updated');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>My Attendance</h1>
          <p>From login/logout · Office 10:00–19:00 (9h) · 30 min buffer · Extra after 9h30m = OT · Half day &lt;6h · Please logout before closing the tab</p>
        </div>
        <button className="btn" type="button" onClick={punch} disabled={busy || Boolean(today?.checkIn && today?.checkOut)}>
          {today?.checkIn && !today?.checkOut ? 'Check out' : 'Check in'}
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="success">{message}</div> : null}
      <div className="grid stats" style={{ marginBottom: '1rem' }}>
        <div className="stat"><div className="label">Records</div><div className="value">{items.length}</div></div>
        <div className="stat"><div className="label">Attendance %</div><div className="value">{presentRate}%</div></div>
        <div className="stat"><div className="label">Avg hours</div><div className="value">{avgHours}h</div></div>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Login time</th>
              <th>Logout time</th>
              <th>Work hours</th>
              <th>Overtime</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a._id}>
                <td>{new Date(a.date).toLocaleDateString()}</td>
                <td><span className={`badge ${a.status}`}>{statusLabel(a.status)}</span></td>
                <td>{a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : '—'}</td>
                <td>{a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : '—'}</td>
                <td>{a.checkOut ? formatHours(a.workHours) : '—'}</td>
                <td>{(a.overtimeHours || 0) > 0 ? formatHours(a.overtimeHours) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? <div className="empty">No attendance yet. It appears after you log in.</div> : null}
      </div>
    </div>
  );
}

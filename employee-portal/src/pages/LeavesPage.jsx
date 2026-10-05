import { useEffect, useState } from 'react';
import { api } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';

function decisionBy(leave) {
  if (leave.status === 'pending' || !leave.approvedBy) return 'Awaiting manager decision';
  const name =
    leave.approvedBy?.employeeProfile?.name ||
    (leave.approvedBy?.role === 'admin' ? 'Admin' : leave.approvedBy?.email) ||
    'Manager';
  return `${leave.status} by ${name}`;
}

export default function LeavesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    type: 'casual',
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const res = await api('/leaves');
    setItems(res.data.items || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api('/leaves', { method: 'POST', body: form });
      setMessage(res.message || 'Leave request submitted. Your manager and admin have been notified by email.');
      setForm({ type: 'casual', startDate: '', endDate: '', reason: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Leave</h1>
          <p>Apply to your manager — decided requests leave this list after 24 hours</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <form className="form" onSubmit={onSubmit}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <div className="field">
              <label>Type</label>
              <SearchableSelect
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                options={[
                  { value: 'annual', label: 'Annual' },
                  { value: 'sick', label: 'Sick' },
                  { value: 'casual', label: 'Casual' },
                  { value: 'unpaid', label: 'Unpaid' },
                ]}
              />
            </div>
            <div className="field">
              <label>Start</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div className="field">
              <label>End</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </div>
          </div>
          <div className="field">
            <label>Reason</label>
            <textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          </div>
          <button className="btn">Apply leave</button>
        </form>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Status</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l._id}>
                <td>{l.type}</td>
                <td>
                  {new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}
                  <div className="muted" style={{ fontSize: '0.82rem' }}>{l.reason}</div>
                </td>
                <td>
                  {l.days}
                  {l.voidedDates?.length ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      Came to work {l.voidedDates.length} day(s) — not counted as leave
                    </div>
                  ) : null}
                </td>
                <td><span className={`badge ${l.status}`}>{l.status}</span></td>
                <td>
                  <div>{decisionBy(l)}</div>
                  {l.decisionAt ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      {new Date(l.decisionAt).toLocaleString()}
                    </div>
                  ) : null}
                  {l.decisionNote ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>Comment: {l.decisionNote}</div>
                  ) : null}
                  {l.previousDecision?.status ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      Admin overrode the previous {l.previousDecision.status} decision
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? <div className="empty">No leave requests yet</div> : null}
      </div>
    </div>
  );
}

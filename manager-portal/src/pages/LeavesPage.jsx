import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';

function decisionBy(leave) {
  if (leave.status === 'pending' || !leave.approvedBy) return '—';
  return (
    leave.approvedBy?.employeeProfile?.name ||
    (leave.approvedBy?.role === 'admin' ? 'Admin' : leave.approvedBy?.email) ||
    '—'
  );
}

const emptyForm = {
  type: 'casual',
  startDate: '',
  endDate: '',
  reason: '',
};

export default function LeavesPage() {
  const [teamItems, setTeamItems] = useState([]);
  const [myItems, setMyItems] = useState([]);
  const [teamQuery, setTeamQuery] = useState('');
  const [teamStatus, setTeamStatus] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [decision, setDecision] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');

  async function load() {
    const [team, mine] = await Promise.all([
      api('/leaves'),
      api('/leaves?mine=1'),
    ]);
    setTeamItems(team.data.items || []);
    setMyItems(mine.data.items || []);
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
      setMessage(res.message || 'Leave request submitted. Admin has been notified by email.');
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function startDecision(id, status) {
    setError('');
    setMessage('');
    setDecision({ id, status });
    setDecisionNote('');
  }

  async function confirmDecision() {
    if (!decision) return;
    setError('');
    setMessage('');
    const note = decisionNote.trim();
    if (!note) {
      setError('Add a comment before approving or rejecting this leave');
      return;
    }
    try {
      await api(`/leaves/${decision.id}/status`, {
        method: 'PUT',
        body: { status: decision.status, decisionNote: note },
      });
      setMessage(`Leave ${decision.status}. The employee can see your comment.`);
      setDecision(null);
      setDecisionNote('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredTeam = useMemo(() => {
    const needle = teamQuery.trim().toLowerCase();
    return teamItems.filter((l) => {
      if (teamStatus && l.status !== teamStatus) return false;
      if (!needle) return true;
      const hay = [
        l.employeeId?.name,
        l.employeeId?.employeeId,
        l.employeeId?.email,
        l.type,
        l.reason,
        l.status,
      ].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [teamItems, teamQuery, teamStatus]);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Leaves</h1>
          <p>Approve or reject team leave — decided requests leave this list after 24 hours</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Apply for leave</h3>
        <p className="muted" style={{ marginBottom: '0.85rem', fontSize: '0.9rem' }}>
          Your request is sent to Admin for approval, the same way employees request leave from you.
        </p>
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
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>End</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="field">
            <label>Reason</label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
            />
          </div>
          <button className="btn">Submit to admin</button>
        </form>
      </div>

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>My leave requests</h3>
        <div className="table-wrap">
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
              {myItems.map((l) => (
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
                    {l.status === 'pending' ? 'Awaiting admin' : decisionBy(l)}
                    {l.decisionNote ? (
                      <div className="muted" style={{ fontSize: '0.82rem' }}>Comment: {l.decisionNote}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!myItems.length ? <div className="empty">You have not applied for leave yet</div> : null}
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-head">
          <div>
            <strong>Filter team leave</strong>
            <p className="muted">Search by employee or reason, then narrow by status</p>
          </div>
        </div>
        <div className="filter-bar-grid">
          <div className="field filter-bar-search">
            <label>Search</label>
            <input
              type="search"
              placeholder="Name, ID, type, or reason"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Status</label>
            <SearchableSelect
              value={teamStatus}
              onChange={(e) => setTeamStatus(e.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: '0.75rem' }}>Team leave requests</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Decision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredTeam.map((l) => (
                <tr key={l._id}>
                  <td><EmployeeNameLink employee={l.employeeId} /></td>
                  <td>{l.type}</td>
                  <td>
                    {new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}
                    <div className="muted" style={{ fontSize: '0.82rem' }}>{l.reason}</div>
                    {l.voidedDates?.length ? (
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        Came to work {l.voidedDates.length} day(s) — not counted as leave
                      </div>
                    ) : null}
                  </td>
                  <td><span className={`badge ${l.status}`}>{l.status}</span></td>
                  <td>
                    {l.status === 'pending' ? 'Waiting for you' : decisionBy(l)}
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
                  <td className="row-actions">
                    {l.status === 'pending' && decision?.id === l._id ? (
                      <div className="leave-decision">
                        <textarea
                          rows={3}
                          value={decisionNote}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          placeholder={decision.status === 'approved'
                            ? 'Comment for the employee (required)'
                            : 'Reason for rejection (required)'}
                        />
                        <div className="row-actions">
                          <button
                            className={decision.status === 'rejected' ? 'btn danger' : 'btn secondary'}
                            type="button"
                            onClick={confirmDecision}
                          >
                            Confirm {decision.status}
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => { setDecision(null); setDecisionNote(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : l.status === 'pending' ? (
                      <>
                        <button className="btn secondary" type="button" onClick={() => startDecision(l._id, 'approved')}>Approve</button>
                        <button className="btn danger" type="button" onClick={() => startDecision(l._id, 'rejected')}>Reject</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredTeam.length ? <div className="empty">{teamItems.length ? 'No team leave requests match these filters' : 'No team leave requests'}</div> : null}
        </div>
      </div>
    </div>
  );
}

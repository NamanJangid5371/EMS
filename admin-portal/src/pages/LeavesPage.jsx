import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';

function decidedByLabel(user) {
  if (!user) return '—';
  return user.employeeProfile?.name
    || (user.role === 'admin' ? 'Admin' : user.email)
    || '—';
}

function canOverrideManagerDecision(leave) {
  return (
    (leave.status === 'approved' || leave.status === 'rejected')
    && leave.employeeId?.userId?.role !== 'manager'
    && (leave.approvedBy?.role === 'manager' || Boolean(leave.previousDecision?.status))
  );
}

export default function LeavesPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [decision, setDecision] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');

  async function load() {
    const res = await api('/leaves?history=1&limit=100');
    setItems(res.data.items || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function startDecision(id, status) {
    setError('');
    setDecision({ id, status });
    setDecisionNote('');
  }

  async function confirmDecision() {
    if (!decision) return;
    setError('');
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
      setDecision(null);
      setDecisionNote('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = items.filter((l) => {
      if (statusFilter && l.status !== statusFilter) return false;
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
    const rank = (leave) => {
      if (leave.status === 'pending') return 0;
      if (canOverrideManagerDecision(leave)) return 1;
      return 2;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [items, q, statusFilter]);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Leave Oversight</h1>
          <p>Approve pending leave, or override a manager’s decision for an employee</p>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}

      <div className="filter-bar">
        <div className="filter-bar-head">
          <div>
            <strong>Filter requests</strong>
            <p className="muted">Search by employee or reason, then narrow by status</p>
          </div>
        </div>
        <div className="filter-bar-grid">
          <div className="field filter-bar-search">
            <label>Search</label>
            <input
              type="search"
              placeholder="Name, ID, type, or reason"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Status</label>
            <SearchableSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
            {filtered.map((l) => (
              <tr key={l._id}>
                <td>
                  <EmployeeNameLink employee={l.employeeId} />
                  <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.3rem' }}>
                    {l.employeeId?.userId?.role === 'manager' ? 'Manager · needs admin approval' : (l.employeeId?.userId?.role || 'employee')}
                  </div>
                </td>
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
                  {l.status === 'pending'
                    ? 'Pending'
                    : decidedByLabel(l.approvedBy)}
                  {l.approvedBy?.role === 'manager' && l.status !== 'pending' ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>Manager decision</div>
                  ) : null}
                  {l.decisionAt ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      {new Date(l.decisionAt).toLocaleString()}
                    </div>
                  ) : null}
                  {l.decisionNote ? (
                    <div className="muted" style={{ fontSize: '0.82rem' }}>Comment: {l.decisionNote}</div>
                  ) : null}
                  {l.previousDecision?.status ? (
                    <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
                      Overrode {l.previousDecision.status} by {decidedByLabel(l.previousDecision.approvedBy)}
                    </div>
                  ) : null}
                </td>
                <td className="row-actions">
                  {decision?.id === l._id ? (
                    <div className="leave-decision">
                      <textarea
                        rows={3}
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                        placeholder={decision.override
                          ? 'Comment for overriding the manager’s decision (required)'
                          : decision.status === 'approved'
                            ? 'Comment for the employee (required)'
                            : 'Reason for rejection (required)'}
                      />
                      <div className="row-actions">
                        <button
                          className={decision.status === 'rejected' ? 'btn danger' : 'btn secondary'}
                          type="button"
                          onClick={confirmDecision}
                        >
                          {decision.override ? `Override: ${decision.status}` : `Confirm ${decision.status}`}
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
                  ) : canOverrideManagerDecision(l) ? (
                    <button
                      className={l.status === 'approved' ? 'btn danger' : 'btn secondary'}
                      type="button"
                      onClick={() => {
                        setError('');
                        setDecision({
                          id: l._id,
                          status: l.status === 'approved' ? 'rejected' : 'approved',
                          override: true,
                        });
                        setDecisionNote('');
                      }}
                    >
                      {l.status === 'approved' ? 'Override: Reject' : 'Override: Approve'}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? <div className="empty">{items.length ? 'No leave requests match these filters' : 'No leave requests yet'}</div> : null}
      </div>
    </div>
  );
}

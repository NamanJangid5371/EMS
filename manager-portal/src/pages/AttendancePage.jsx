import { useEffect, useState } from 'react';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';

function formatHours(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(2)}h`;
}

function statusLabel(status) {
  if (status === 'present') return 'full day';
  return String(status || '—').replace(/_/g, ' ');
}

const SORT_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'employeeName', label: 'Employee name' },
  { value: 'status', label: 'Status' },
  { value: 'checkIn', label: 'Login time' },
  { value: 'checkOut', label: 'Logout time' },
  { value: 'workHours', label: 'Work hours' },
  { value: 'overtimeHours', label: 'Overtime' },
];

const EMPTY_QUERY = {
  q: '',
  employeeId: '',
  departmentId: '',
  status: '',
  fromDate: '',
  toDate: '',
  minWorkHours: '',
  maxWorkHours: '',
  hasOvertime: false,
  stillLoggedIn: false,
  sortBy: 'date',
  sortOrder: 'desc',
};

function buildParams(query) {
  const params = new URLSearchParams({
    limit: '500',
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.employeeId) params.set('employeeId', query.employeeId);
  if (query.departmentId) params.set('departmentId', query.departmentId);
  if (query.status) params.set('status', query.status);
  if (query.fromDate) params.set('from', query.fromDate);
  if (query.toDate) params.set('to', query.toDate);
  if (query.minWorkHours !== '') params.set('minWorkHours', query.minWorkHours);
  if (query.maxWorkHours !== '') params.set('maxWorkHours', query.maxWorkHours);
  if (query.hasOvertime) params.set('hasOvertime', 'true');
  if (query.stillLoggedIn) params.set('stillLoggedIn', 'true');
  return params;
}

function exportCsv(rows) {
  const header = [
    'Date',
    'Employee ID',
    'Employee name',
    'Department',
    'Status',
    'Login',
    'Logout',
    'Work hours',
    'Overtime hours',
  ];
  const lines = rows.map((a) => [
    new Date(a.date).toLocaleDateString(),
    a.employeeId?.employeeId || '',
    a.employeeId?.name || '',
    a.employeeId?.departmentId?.name || '',
    statusLabel(a.status),
    a.checkIn ? new Date(a.checkIn).toLocaleString() : '',
    a.checkOut ? new Date(a.checkOut).toLocaleString() : '',
    a.workHours ?? '',
    a.overtimeHours ?? '',
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `team-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AttendancePage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [query, setQuery] = useState(EMPTY_QUERY);
  const [appliedQuery, setAppliedQuery] = useState(EMPTY_QUERY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function runQuery(nextQuery = query) {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/attendance?${buildParams(nextQuery).toString()}`);
      setItems(res.data.items || []);
      setTotal(res.data.total ?? 0);
      setSummary(res.data.summary || null);
      setAppliedQuery(nextQuery);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([
      api('/employees?limit=100'),
      api('/departments'),
      runQuery(EMPTY_QUERY),
    ]).then(([emps, deps]) => {
      setEmployees(emps.data.items || []);
      setDepartments(deps.data || []);
    }).catch((err) => setError(err.message));
  }, []);

  function onSubmit(e) {
    e.preventDefault();
    runQuery();
  }

  function resetQuery() {
    setQuery(EMPTY_QUERY);
    runQuery(EMPTY_QUERY);
  }

  function onSortChange(field) {
    const next = { ...appliedQuery };
    if (next.sortBy === field) {
      next.sortOrder = next.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      next.sortBy = field;
      next.sortOrder = 'desc';
    }
    setQuery(next);
    runQuery(next);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Team Attendance</h1>
          <p>Filter your team&apos;s attendance · Office 10:00–19:00 (9h) · Please logout before closing the tab · 30 min buffer · Extra after 9h30m = OT · Half day &lt;6h</p>
        </div>
        <button
          className="btn secondary"
          type="button"
          disabled={!items.length}
          onClick={() => exportCsv(items)}
        >
          Export CSV
        </button>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      <div className="filter-bar">
        <div className="filter-bar-head">
          <div>
            <strong>Query team attendance</strong>
            <p className="muted">Search a person or pick dates, then open extra options if needed</p>
          </div>
        </div>
        <form className="filter-bar-form" onSubmit={onSubmit}>
          <div className="filter-bar-grid">
            <div className="field filter-bar-search">
              <label>Search</label>
              <input
                type="search"
                placeholder="Name, email, or employee ID"
                value={query.q}
                onChange={(e) => setQuery({ ...query, q: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Team member</label>
              <SearchableSelect
                value={query.employeeId}
                onChange={(e) => setQuery({ ...query, employeeId: e.target.value })}
                options={[
                  { value: '', label: 'All team members' },
                  ...employees.map((e) => ({ value: e._id, label: `${e.name} (${e.employeeId})` })),
                ]}
              />
            </div>
            <div className="field">
              <label>Department</label>
              <SearchableSelect
                value={query.departmentId}
                onChange={(e) => setQuery({ ...query, departmentId: e.target.value })}
                options={[
                  { value: '', label: 'All departments' },
                  ...departments.map((d) => ({ value: d._id, label: d.name })),
                ]}
              />
            </div>
            <div className="field">
              <label>Status</label>
              <SearchableSelect
                value={query.status}
                onChange={(e) => setQuery({ ...query, status: e.target.value })}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'present', label: 'Full day' },
                  { value: 'late', label: 'Late' },
                  { value: 'half_day', label: 'Half day' },
                  { value: 'on_leave', label: 'On leave' },
                  { value: 'absent', label: 'Absent' },
                ]}
              />
            </div>
            <div className="field">
              <label>From</label>
              <input
                type="date"
                value={query.fromDate}
                onChange={(e) => setQuery({ ...query, fromDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>To</label>
              <input
                type="date"
                value={query.toDate}
                onChange={(e) => setQuery({ ...query, toDate: e.target.value })}
              />
            </div>
          </div>
          <details className="filter-advanced">
            <summary>Hours, sort, and extra options</summary>
            <div className="filter-bar-grid even">
              <div className="field">
                <label>Min hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={query.minWorkHours}
                  onChange={(e) => setQuery({ ...query, minWorkHours: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Max hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={query.maxWorkHours}
                  onChange={(e) => setQuery({ ...query, maxWorkHours: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Sort by</label>
                <SearchableSelect
                  value={query.sortBy}
                  onChange={(e) => setQuery({ ...query, sortBy: e.target.value })}
                  options={SORT_OPTIONS}
                />
              </div>
              <div className="field">
                <label>Order</label>
                <SearchableSelect
                  value={query.sortOrder}
                  onChange={(e) => setQuery({ ...query, sortOrder: e.target.value })}
                  options={[
                    { value: 'desc', label: 'Newest / Highest first' },
                    { value: 'asc', label: 'Oldest / Lowest first' },
                  ]}
                />
              </div>
            </div>
            <div className="filter-bar-actions" style={{ marginTop: '0.7rem' }}>
              <label className="filter-chip">
                <input
                  type="checkbox"
                  checked={query.hasOvertime}
                  onChange={(e) => setQuery({ ...query, hasOvertime: e.target.checked })}
                />
                Overtime only
              </label>
              <label className="filter-chip">
                <input
                  type="checkbox"
                  checked={query.stillLoggedIn}
                  onChange={(e) => setQuery({ ...query, stillLoggedIn: e.target.checked })}
                />
                Still logged in
              </label>
            </div>
          </details>
          <div className="filter-bar-actions">
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Running query…' : 'Run query'}
            </button>
            <button className="btn ghost" type="button" onClick={resetQuery}>Reset</button>
          </div>
        </form>
      </div>

      {summary ? (
        <div className="grid stats" style={{ marginBottom: '1rem' }}>
          <div className="stat">
            <div className="label">Matching records</div>
            <div className="value">{summary.records}</div>
          </div>
          <div className="stat">
            <div className="label">Total work hours</div>
            <div className="value">{formatHours(summary.totalWorkHours)}</div>
          </div>
          <div className="stat">
            <div className="label">Total overtime</div>
            <div className="value">{formatHours(summary.totalOvertimeHours)}</div>
          </div>
          <div className="stat">
            <div className="label">With overtime</div>
            <div className="value">{summary.withOvertime}</div>
          </div>
          <div className="stat">
            <div className="label">Still logged in</div>
            <div className="value">{summary.stillLoggedIn}</div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Showing {items.length} of {total} records for your team
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {SORT_OPTIONS.map((opt) => (
                  <th key={opt.value}>
                    <button
                      type="button"
                      className={`sort-head ${appliedQuery.sortBy === opt.value ? 'active' : ''}`}
                      onClick={() => onSortChange(opt.value)}
                    >
                      {opt.label}
                      {appliedQuery.sortBy === opt.value ? (appliedQuery.sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th>Department</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id}>
                  <td>{new Date(a.date).toLocaleDateString()}</td>
                  <td><EmployeeNameLink employee={a.employeeId} /></td>
                  <td><span className={`badge ${a.status}`}>{statusLabel(a.status)}</span></td>
                  <td>{a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : '—'}</td>
                  <td>{a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : 'Still in'}</td>
                  <td>{a.checkOut ? formatHours(a.workHours) : '—'}</td>
                  <td>{(a.overtimeHours || 0) > 0 ? formatHours(a.overtimeHours) : '—'}</td>
                  <td>{a.employeeId?.departmentId?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? <div className="empty">No records match your filters — adjust and run again</div> : null}
        </div>
      </div>
    </div>
  );
}

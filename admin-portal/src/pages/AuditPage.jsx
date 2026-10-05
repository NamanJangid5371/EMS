import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';

const SORT_OPTIONS = [
  { value: 'timestamp', label: 'When' },
  { value: 'name', label: 'Name' },
  { value: 'department', label: 'Department' },
  { value: 'role', label: 'Role' },
  { value: 'action', label: 'Action' },
  { value: 'entity', label: 'Record' },
];

const emptyQuery = {
  departmentId: '',
  fromDate: '',
  toDate: '',
  sortBy: 'timestamp',
  sortOrder: 'desc',
  page: 1,
};

function ActorCell({ actor }) {
  if (!actor?.name && !actor?.email) return <span>—</span>;
  return (
    <div>
      {actor.employeeProfileId && actor.name ? (
        <EmployeeNameLink employee={{ _id: actor.employeeProfileId, name: actor.name }} />
      ) : (
        <strong>{actor.name || actor.email}</strong>
      )}
      <div className="muted" style={{ fontSize: '0.82rem' }}>
        {[actor.employeeId, actor.email].filter(Boolean).join(' · ') || '—'}
      </div>
    </div>
  );
}

function TargetCell({ target, entityLabel }) {
  if (!target?.name && !entityLabel) return <span>—</span>;
  return (
    <div>
      {target?.kind === 'employee' && target?.id && target?.name ? (
        <EmployeeNameLink employee={{ _id: target.id, name: target.name }} />
      ) : target?.kind === 'department' && target?.id && target?.name ? (
        <Link className="btn secondary name-link" to={`/departments/${target.id}`}>
          {target.name}
        </Link>
      ) : (
        <strong>{target?.name || entityLabel}</strong>
      )}
      <div className="muted" style={{ fontSize: '0.82rem' }}>
        {[entityLabel, target?.employeeId, target?.departmentName, target?.extra]
          .filter(Boolean)
          .filter((value, index, list) => list.indexOf(value) === index)
          .join(' · ') || '—'}
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [query, setQuery] = useState(emptyQuery);
  const [applied, setApplied] = useState(emptyQuery);
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(nextQuery = applied) {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      limit: '50',
      page: String(nextQuery.page || 1),
      sortBy: nextQuery.sortBy,
      sortOrder: nextQuery.sortOrder,
    });
    if (nextQuery.departmentId) params.set('departmentId', nextQuery.departmentId);
    if (nextQuery.fromDate) params.set('fromDate', nextQuery.fromDate);
    if (nextQuery.toDate) params.set('toDate', nextQuery.toDate);

    try {
      const [logs, deps] = await Promise.all([
        api(`/audit-logs?${params.toString()}`),
        departments.length ? Promise.resolve({ data: departments }) : api('/departments'),
      ]);
      setItems(logs.data.items || []);
      setTotal(logs.data.total || 0);
      setPages(logs.data.pages || 0);
      if (!departments.length) setDepartments(deps.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(emptyQuery).catch((err) => setError(err.message));
  }, []);

  function applyFilters(event) {
    event?.preventDefault?.();
    const next = { ...query, page: 1 };
    setApplied(next);
    load(next);
  }

  function resetFilters() {
    setQuery(emptyQuery);
    setApplied(emptyQuery);
    load(emptyQuery);
  }

  function onSortChange(field) {
    const next = {
      ...applied,
      sortBy: field,
      sortOrder: applied.sortBy === field && applied.sortOrder === 'desc' ? 'asc' : 'desc',
      page: 1,
    };
    setQuery(next);
    setApplied(next);
    load(next);
  }

  function goToPage(page) {
    const next = { ...applied, page };
    setQuery(next);
    setApplied(next);
    load(next);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Audit Logs</h1>
          <p>Filter activity by date and department</p>
        </div>
      </div>

      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      <div className="filter-bar">
        <div className="filter-bar-head">
          <div>
            <strong>Filter activity</strong>
            <p className="muted">Narrow logs by department and date range</p>
          </div>
        </div>
        <form className="filter-bar-form" onSubmit={applyFilters}>
          <div className="filter-bar-grid even">
            <div className="field">
              <label>Department</label>
              <SearchableSelect
                value={query.departmentId}
                onChange={(e) => setQuery({ ...query, departmentId: e.target.value })}
                options={[
                  { value: '', label: 'All departments' },
                  ...departments.map((dept) => ({ value: dept._id, label: dept.name })),
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
          <div className="filter-bar-actions">
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Filtering…' : 'Apply filters'}
            </button>
            <button className="btn ghost" type="button" onClick={resetFilters}>Reset</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Showing {items.length} of {total} events
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {SORT_OPTIONS.map((opt) => (
                  <th key={opt.value}>
                    <button
                      type="button"
                      className={`sort-head ${applied.sortBy === opt.value ? 'active' : ''}`}
                      onClick={() => onSortChange(opt.value)}
                    >
                      {opt.label}
                      {applied.sortBy === opt.value ? (applied.sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log._id}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td><ActorCell actor={log.actor} /></td>
                  <td>{log.actor?.departmentName || '—'}</td>
                  <td><span className="badge">{log.actor?.role || '—'}</span></td>
                  <td><span className="badge">{log.actionLabel || log.action}</span></td>
                  <td><TargetCell target={log.target} entityLabel={log.entityLabel} /></td>
                  <td>
                    <div>{log.summary}</div>
                    {log.target?.departmentName && log.target.departmentName !== log.actor?.departmentName ? (
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        Record dept: {log.target.departmentName}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? (
            <div className="empty">No audit events match the current filters</div>
          ) : null}
        </div>
        {pages > 1 ? (
          <div className="row-actions" style={{ marginTop: '1rem' }}>
            <button
              className="btn ghost"
              type="button"
              disabled={applied.page <= 1 || loading}
              onClick={() => goToPage(applied.page - 1)}
            >
              Previous
            </button>
            <span className="muted">Page {applied.page} of {pages}</span>
            <button
              className="btn ghost"
              type="button"
              disabled={applied.page >= pages || loading}
              onClick={() => goToPage(applied.page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

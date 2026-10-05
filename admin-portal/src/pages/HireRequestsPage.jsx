import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';

export default function HireRequestsPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const res = await api('/hire-requests?limit=100');
    const list = res.data.items || [];
    const rank = { pending: 0, approved: 1, rejected: 2 };
    list.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || new Date(b.createdAt) - new Date(a.createdAt));
    setItems(list);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!needle) return true;
      const hay = [
        row.employeeId,
        row.name,
        row.email,
        row.designation,
        row.departmentId?.name,
        row.requestedBy?.name,
        row.status,
      ].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, statusFilter]);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Hire Requests</h1>
          <p>Review employee profiles submitted by managers</p>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}

      <div className="filter-bar">
        <div className="filter-bar-head">
          <div>
            <strong>Filter requests</strong>
            <p className="muted">Search by name, ID, department, or requester</p>
          </div>
        </div>
        <div className="filter-bar-grid">
          <div className="field filter-bar-search">
            <label>Search</label>
            <input
              type="search"
              placeholder="Name, email, ID, or department"
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
              <th>Proposed ID</th>
              <th>Name</th>
              <th>Department</th>
              <th>Requested by</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row._id}>
                <td>{row.employeeId}</td>
                <td>
                  <div>{row.name}</div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>{row.email}</div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>{row.designation || '—'}</div>
                </td>
                <td>{row.departmentId?.name || '—'}</td>
                <td>{row.requestedBy?.name || '—'}</td>
                <td><span className={`badge ${row.status}`}>{row.status}</span></td>
                <td className="row-actions">
                  <Link className="btn" to={`/hire-requests/${row._id}`}>Review profile</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? <div className="empty">{items.length ? 'No hire requests match these filters' : 'No hire requests'}</div> : null}
      </div>
    </div>
  );
}

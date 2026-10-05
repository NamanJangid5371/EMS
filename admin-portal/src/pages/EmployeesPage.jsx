import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';

const emptyForm = {
  employeeId: '',
  name: '',
  email: '',
  password: '',
  phone: '',
  designation: '',
  dateOfBirth: '',
  role: 'employee',
  departmentId: '',
  managerId: '',
};

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'employeeId', label: 'Employee ID' },
  { value: 'role', label: 'Role' },
  { value: 'designation', label: 'Designation' },
  { value: 'department', label: 'Department' },
  { value: 'manager', label: 'Manager' },
  { value: 'status', label: 'Status' },
];

function statusRank(status) {
  if (status === 'active') return 0;
  if (status === 'on_leave') return 1;
  return 2;
}

function compareEmployees(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'desc' ? -1 : 1;
  const text = (value) => String(value || '').toLowerCase();
  let left = '';
  let right = '';

  if (sortBy === 'employeeId') {
    left = text(a.employeeId);
    right = text(b.employeeId);
  } else if (sortBy === 'role') {
    left = text(a.userId?.role || 'employee');
    right = text(b.userId?.role || 'employee');
  } else if (sortBy === 'designation') {
    left = text(a.designation);
    right = text(b.designation);
  } else if (sortBy === 'department') {
    left = text(a.departmentId?.name);
    right = text(b.departmentId?.name);
  } else if (sortBy === 'manager') {
    left = text(a.managerId?.name);
    right = text(b.managerId?.name);
  } else if (sortBy === 'status') {
    const rank = (statusRank(a.employmentStatus) - statusRank(b.employmentStatus)) * dir;
    if (rank !== 0) return rank;
    return text(a.name).localeCompare(text(b.name));
  } else {
    left = text(a.name);
    right = text(b.name);
  }

  if (left === right) return text(a.name).localeCompare(text(b.name));
  return left.localeCompare(right) * dir;
}

export default function EmployeesPage() {
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [designation, setDesignation] = useState('');
  const [sortBy, setSortBy] = useState('status');
  const [sortOrder, setSortOrder] = useState('asc');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    const params = new URLSearchParams({ limit: '200', sortBy: 'name', sortOrder: 'asc' });
    if (q.trim()) params.set('q', q.trim());
    if (departmentId) params.set('departmentId', departmentId);
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    if (designation.trim()) params.set('designation', designation.trim());

    const [emps, deps, users] = await Promise.all([
      api(`/employees?${params.toString()}`),
      api('/departments'),
      api('/users?role=manager&limit=100'),
    ]);
    setItems(emps.data.items || []);
    setDepartments(deps.data || []);
    setManagers(
      (users.data.items || [])
        .filter((u) => u.employeeProfile)
        .map((u) => ({
          id: u.employeeProfile._id || u.employeeProfile,
          name: u.employeeProfile.name || u.email,
        }))
    );
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => compareEmployees(a, b, sortBy, sortOrder)),
    [items, sortBy, sortOrder]
  );

  const summary = useMemo(() => {
    const active = items.filter((e) => e.employmentStatus === 'active').length;
    const onLeave = items.filter((e) => e.employmentStatus === 'on_leave').length;
    const inactive = items.filter((e) => e.employmentStatus === 'inactive').length;
    const managersCount = items.filter((e) => e.userId?.role === 'manager').length;
    const employeesCount = items.filter((e) => (e.userId?.role || 'employee') === 'employee').length;
    return { total: items.length, active, onLeave, inactive, managersCount, employeesCount };
  }, [items]);

  async function onSearch(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setQ('');
    setDepartmentId('');
    setRole('');
    setStatus('');
    setDesignation('');
    setSortBy('status');
    setSortOrder('asc');
    setError('');
    setLoading(true);
    Promise.resolve()
      .then(async () => {
        const emps = await api('/employees?limit=200&sortBy=name&sortOrder=asc');
        setItems(emps.data.items || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function onSortChange(field) {
    if (sortBy === field) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(field);
    setSortOrder(field === 'status' ? 'asc' : 'asc');
  }

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/employees', {
        method: 'POST',
        body: {
          ...form,
          dateOfBirth: form.dateOfBirth || undefined,
          departmentId: form.departmentId || undefined,
          managerId: form.managerId || undefined,
        },
      });
      setForm(emptyForm);
      setShowForm(false);
      setMessage('Employee created');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Employees</h1>
          <p>Search, filter, and sort workforce records</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'Add employee'}
        </button>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      <div className="grid stats" style={{ marginBottom: '1rem' }}>
        <div className="stat">
          <div className="label">Showing</div>
          <div className="value">{summary.total}</div>
        </div>
        <div className="stat">
          <div className="label">Active</div>
          <div className="value">{summary.active}</div>
        </div>
        <div className="stat">
          <div className="label">On leave</div>
          <div className="value">{summary.onLeave}</div>
        </div>
        <div className="stat">
          <div className="label">Inactive</div>
          <div className="value">{summary.inactive}</div>
        </div>
        <div className="stat">
          <div className="label">Managers</div>
          <div className="value">{summary.managersCount}</div>
        </div>
        <div className="stat">
          <div className="label">Employees</div>
          <div className="value">{summary.employeesCount}</div>
        </div>
      </div>

      {showForm ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Add employee</h3>
          <form className="form" onSubmit={onCreate}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              {[
                ['employeeId', 'Employee ID'],
                ['name', 'Full name'],
                ['email', 'Email'],
                ['password', 'Temp password'],
                ['phone', 'Phone'],
                ['designation', 'Designation'],
              ].map(([key, label]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <input
                    type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required={['employeeId', 'name', 'email', 'password'].includes(key)}
                  />
                </div>
              ))}
              <div className="field">
                <label>Date of birth</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value || '' })}
                />
              </div>
              <div className="field">
                <label>Role</label>
                <SearchableSelect
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  options={[
                    { value: 'employee', label: 'Employee' },
                    { value: 'manager', label: 'Manager' },
                  ]}
                />
              </div>
              <div className="field">
                <label>Department</label>
                <SearchableSelect
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  options={[
                    { value: '', label: 'Select' },
                    ...departments.map((d) => ({ value: d._id, label: d.name })),
                  ]}
                />
              </div>
              <div className="field">
                <label>Manager</label>
                <SearchableSelect
                  value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  options={[
                    { value: '', label: 'Select' },
                    ...managers.map((m) => ({ value: m.id, label: m.name })),
                  ]}
                />
              </div>
            </div>
            <button className="btn" type="submit">Create employee</button>
          </form>
        </div>
      ) : null}

      <div className="filter-bar">
        <div className="filter-bar-head">
          <div>
            <strong>Find people</strong>
            <p className="muted">Search by name, email, ID, or designation</p>
          </div>
        </div>
        <form className="filter-bar-form" onSubmit={onSearch}>
          <div className="filter-bar-grid">
            <div className="field filter-bar-search">
              <label>Search</label>
              <input
                type="search"
                placeholder="Name, email, ID, designation"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Department</label>
              <SearchableSelect
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                options={[
                  { value: '', label: 'All departments' },
                  ...departments.map((d) => ({ value: d._id, label: d.name })),
                ]}
              />
            </div>
            <div className="field">
              <label>Role</label>
              <SearchableSelect
                value={role}
                onChange={(e) => setRole(e.target.value)}
                options={[
                  { value: '', label: 'All roles' },
                  { value: 'employee', label: 'Employee' },
                  { value: 'manager', label: 'Manager' },
                ]}
              />
            </div>
            <div className="field">
              <label>Status</label>
              <SearchableSelect
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'on_leave', label: 'On leave' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
            <div className="field">
              <label>Designation</label>
              <input
                placeholder="e.g. Developer"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
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
        <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Click a column header to sort · {SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label || 'Name'} {sortOrder === 'asc' ? '↑' : '↓'}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {SORT_OPTIONS.map((opt) => (
                  <th key={opt.value}>
                    <button
                      type="button"
                      className={`sort-head ${sortBy === opt.value ? 'active' : ''}`}
                      onClick={() => onSortChange(opt.value)}
                    >
                      {opt.label}
                      {sortBy === opt.value ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th>Login password</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((e) => (
                <tr key={e._id}>
                  <td>
                    <div><EmployeeNameLink employee={e} /></div>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>{e.email}</div>
                  </td>
                  <td>{e.employeeId}</td>
                  <td><span className="badge">{e.userId?.role || 'employee'}</span></td>
                  <td>{e.designation || '—'}</td>
                  <td>{e.departmentId?.name || '—'}</td>
                  <td>{e.managerId?.name || '—'}</td>
                  <td><span className={`badge ${e.employmentStatus}`}>{String(e.employmentStatus || '').replace(/_/g, ' ')}</span></td>
                  <td>
                    <code className="login-password">{e.userId?.loginPassword || '—'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sortedItems.length ? <div className="empty">No employees match the current filters</div> : null}
        </div>
      </div>
    </div>
  );
}

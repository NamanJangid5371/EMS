import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';

const emptyForm = {
  employeeId: '',
  name: '',
  email: '',
  password: '',
  phone: '',
  designation: '',
  joiningDate: '',
  dateOfBirth: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
  managerNote: '',
};

export default function TeamPage() {
  const { user } = useAuth();
  const profile = user?.profile || {};
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');

  const departmentName = profile.departmentId?.name || 'Not assigned';
  const managerName = profile.name || user?.email || 'You';

  async function load() {
    const [team, hire] = await Promise.all([
      api('/employees'),
      api('/hire-requests'),
    ]);
    setItems(team.data.items || []);
    setRequests(hire.data.items || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await api('/hire-requests', {
        method: 'POST',
        body: {
          ...form,
          joiningDate: form.joiningDate || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          emergencyContact: {
            name: form.emergencyName,
            phone: form.emergencyPhone,
            relation: form.emergencyRelation,
          },
        },
      });
      setForm(emptyForm);
      setShowForm(false);
      setMessage(res.message || 'Request sent to admin for approval');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const designationOptions = useMemo(() => {
    const titles = new Set();
    items.forEach((e) => {
      const title = String(e.designation || '').trim();
      if (title) titles.add(title);
    });
    return [...titles].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredTeam = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((e) => {
      if (statusFilter && e.employmentStatus !== statusFilter) return false;
      if (designationFilter && String(e.designation || '').trim() !== designationFilter) return false;
      if (!needle) return true;
      const hay = [
        e.name,
        e.employeeId,
        e.email,
        e.designation,
        e.departmentId?.name,
        e.employmentStatus,
      ].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, statusFilter, designationFilter]);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>My Team</h1>
          <p>Employees assigned to you · new hires need admin approval · decided requests leave this list after 1 hour</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'Add employee'}
        </button>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      {showForm ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.35rem' }}>Request a new employee</h3>
          <p className="muted" style={{ marginBottom: '0.85rem' }}>
            Department and manager are set to your team. Admin reviews the profile and decides whether to add them to the company.
          </p>
          <form className="form" onSubmit={onSubmit}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              <div className="field">
                <label>Department</label>
                <input value={departmentName} disabled />
              </div>
              <div className="field">
                <label>Manager</label>
                <input value={managerName} disabled />
              </div>
              {[
                ['employeeId', 'Employee ID', true],
                ['name', 'Full name', true],
                ['email', 'Email', true],
                ['password', 'Temp password', true],
                ['phone', 'Phone', false],
                ['designation', 'Designation', false],
              ].map(([key, label, required]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <input
                    type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required={required}
                    minLength={key === 'password' ? 6 : undefined}
                  />
                </div>
              ))}
              <div className="field">
                <label>Date of birth</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Joining date</label>
                <input
                  type="date"
                  value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              <div className="field">
                <label>Emergency contact name</label>
                <input value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })} />
              </div>
              <div className="field">
                <label>Emergency phone</label>
                <input value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} />
              </div>
              <div className="field">
                <label>Relation</label>
                <input value={form.emergencyRelation} onChange={(e) => setForm({ ...form, emergencyRelation: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Note for admin</label>
              <textarea
                rows={3}
                value={form.managerNote}
                onChange={(e) => setForm({ ...form, managerNote: e.target.value })}
                placeholder="Why this person should join your team"
              />
            </div>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Submitting…' : 'Send to admin'}
            </button>
          </form>
        </div>
      ) : null}

      {requests.length ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Hire requests</h3>
          <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            Pending requests stay here. After admin approves or rejects, the row drops from this list in 1 hour.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proposed ID</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Status</th>
                  <th>Admin decision</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => (
                  <tr key={row._id}>
                    <td>{row.employeeId}</td>
                    <td>
                      <div>{row.name}</div>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>{row.email}</div>
                    </td>
                    <td>{row.designation || '—'}</td>
                    <td><span className={`badge ${row.status}`}>{row.status}</span></td>
                    <td>
                      {row.status === 'pending' ? 'Awaiting admin' : (row.decisionNote || '—')}
                      {row.decisionAt ? (
                        <div className="muted" style={{ fontSize: '0.82rem' }}>
                          {new Date(row.decisionAt).toLocaleString()}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="filter-bar">
        <div className="filter-bar-head">
          <div>
            <strong>Find team members</strong>
            <p className="muted">Search by name or ID, then narrow by designation or status</p>
          </div>
        </div>
        <div className="filter-bar-grid">
          <div className="field filter-bar-search">
            <label>Search</label>
            <input
              type="search"
              placeholder="Name, email, ID, or designation"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Designation</label>
            <SearchableSelect
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              options={[
                { value: '', label: 'All designations' },
                ...designationOptions.map((title) => ({ value: title, label: title })),
              ]}
            />
          </div>
          <div className="field">
            <label>Status</label>
            <SearchableSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'on_leave', label: 'On leave' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredTeam.map((e) => (
              <tr key={e._id}>
                <td>{e.employeeId}</td>
                <td>
                  <div><EmployeeNameLink employee={e} /></div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>{e.email}</div>
                </td>
                <td>{e.designation || '—'}</td>
                <td>{e.departmentId?.name || '—'}</td>
                <td><span className={`badge ${e.employmentStatus}`}>{e.employmentStatus}</span></td>
                <td>
                  <Link className="btn ghost" to={`/team/${e._id}`}>View profile</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredTeam.length ? <div className="empty">{items.length ? 'No team members match these filters' : 'No team members yet'}</div> : null}
      </div>
    </div>
  );
}

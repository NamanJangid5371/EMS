import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';

const emptyForm = {
  name: '',
  description: '',
  managerId: '',
  status: 'active',
};

export default function DepartmentsPage() {
  const [items, setItems] = useState([]);
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const [deps, users] = await Promise.all([
      api('/departments'),
      api('/users?role=manager&limit=100'),
    ]);
    setItems(deps.data || []);
    setManagers(
      (users.data.items || [])
        .filter((u) => u.employeeProfile && u.status === 'active')
        .map((u) => ({
          id: u.employeeProfile._id || u.employeeProfile,
          name: u.employeeProfile.name || u.email,
          employeeId: u.employeeId,
        }))
    );
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function startEdit(dept) {
    setError('');
    setMessage('');
    setEditingId(dept._id);
    setForm({
      name: dept.name || '',
      description: dept.description || '',
      managerId: dept.managerId?._id || dept.managerId || '',
      status: dept.status || 'active',
    });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      managerId: form.managerId || null,
      status: form.status,
    };
    try {
      if (editingId) {
        const res = await api(`/departments/${editingId}`, {
          method: 'PUT',
          body: payload,
        });
        setMessage(res.message || `Department "${payload.name}" updated`);
        cancelEdit();
      } else {
        const res = await api('/departments', {
          method: 'POST',
          body: {
            ...payload,
            managerId: payload.managerId || undefined,
          },
        });
        setForm(emptyForm);
        setMessage(res.message || `Department "${payload.name}" created`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const managerOptions = [...managers];
  if (editingId) {
    const current = items.find((d) => d._id === editingId)?.managerId;
    const currentId = current?._id || current;
    if (currentId && !managerOptions.some((m) => m.id === currentId || m.id === String(currentId))) {
      managerOptions.unshift({
        id: currentId,
        name: current?.name || 'Current manager',
        employeeId: current?.employeeId || 'assigned',
      });
    }
  }

  async function updateStatus(dept, status) {
    setError('');
    setMessage('');
    try {
      await api(`/departments/${dept._id}`, {
        method: 'PUT',
        body: {
          name: dept.name,
          description: dept.description || '',
          managerId: dept.managerId?._id || dept.managerId || null,
          status,
        },
      });
      setMessage(`Department marked ${status}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Departments</h1>
          <p>Click a department name to view its members</p>
        </div>
        <button
          className="btn"
          onClick={() => {
            if (showForm && editingId) cancelEdit();
            setShowForm((v) => !v);
          }}
        >
          {showForm ? 'Close form' : 'Create department'}
        </button>
      </div>

      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      {showForm ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.85rem' }}>
            {editingId ? 'Edit department' : 'Create new department'}
          </h3>
          <form className="form" onSubmit={onSubmit}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              <div className="field">
                <label>Department name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Engineering"
                  required
                />
              </div>
              <div className="field">
                <label>Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional summary"
                />
              </div>
              <div className="field">
                <label>Department manager</label>
                <SearchableSelect
                  value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  options={[
                    { value: '', label: 'Assign later' },
                    ...managerOptions.map((m) => ({ value: m.id, label: `${m.name} (${m.employeeId})` })),
                  ]}
                />
              </div>
              <div className="field">
                <label>Status</label>
                <SearchableSelect
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </div>
            </div>
            <div className="row-actions">
              <button className="btn" type="submit">
                {editingId ? 'Save changes' : 'Create department'}
              </button>
              {editingId ? (
                <button className="btn ghost" type="button" onClick={cancelEdit}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      <div className="panel">
        <h3 style={{ marginBottom: '0.75rem' }}>All departments</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Manager</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d._id}>
                  <td>
                    <div>
                      <Link className="btn secondary name-link" to={`/departments/${d._id}`}>
                        {d.name}
                      </Link>
                    </div>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>{d.description || '—'}</div>
                  </td>
                  <td>
                    {d.managerId?._id ? (
                      <EmployeeNameLink employee={d.managerId} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td><span className={`badge ${d.status}`}>{d.status}</span></td>
                  <td className="row-actions">
                    <button className="btn secondary" onClick={() => startEdit(d)}>
                      Edit
                    </button>
                    {d.status === 'active' ? (
                      <button className="btn ghost" onClick={() => updateStatus(d, 'inactive')}>
                        Deactivate
                      </button>
                    ) : (
                      <button className="btn secondary" onClick={() => updateStatus(d, 'active')}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? <div className="empty">No departments yet. Create one above.</div> : null}
        </div>
      </div>
    </div>
  );
}

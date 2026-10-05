import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';
import SearchableSelect from '../components/SearchableSelect';

function isCurrentTask(task) {
  return task.status !== 'completed' && task.status !== 'cancelled';
}

function currentTaskCount(tasks, employeeId) {
  const id = String(employeeId);
  return tasks.filter((task) => {
    const assignedId = task.assignedTo?._id || task.assignedTo;
    return String(assignedId) === id && isCurrentTask(task);
  }).length;
}

function taskCountLabel(count) {
  return `${count} current task${count === 1 ? '' : 's'}`;
}

const emptyForm = {
  projectName: '',
  title: '',
  description: '',
  deadline: '',
  assignedTo: '',
};

export default function TasksPage() {
  const [assignees, setAssignees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoadingPeople(true);
    const [empsRes, tasksRes] = await Promise.all([
      api('/employees?limit=100'),
      api('/tasks'),
    ]);
    const people = (empsRes.data.items || []).filter((e) => {
      const role = typeof e.userId === 'object' ? e.userId?.role : null;
      return role === 'manager' || role === 'employee';
    });
    setAssignees(people);
    setTasks(tasksRes.data || []);
    setLoadingPeople(false);
  }

  useEffect(() => {
    load().catch((err) => {
      setLoadingPeople(false);
      setError(err.message);
    });
  }, []);

  async function onAssign(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!form.assignedTo) {
      setError('Please select a manager or employee');
      return;
    }
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          projectName: form.projectName,
          title: form.title,
          description: form.description,
          deadline: form.deadline,
          assignedTo: form.assignedTo,
        },
      });
      setForm(emptyForm);
      setMessage('Task assigned');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeTask(id) {
    if (!confirm('Remove this task?')) return;
    setError('');
    try {
      await api(`/tasks/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const selected = assignees.find((p) => p._id === form.assignedTo);
  const query = search.trim().toLowerCase();
  const designationOptions = useMemo(() => {
    const titles = new Set();
    assignees.forEach((person) => {
      const title = String(person.designation || '').trim();
      if (title) titles.add(title);
    });
    return [...titles].sort((a, b) => a.localeCompare(b));
  }, [assignees]);

  const filteredAssignees = assignees.filter((person) => {
    const role = typeof person.userId === 'object' ? person.userId?.role : '';
    if (roleFilter && role !== roleFilter) return false;
    const title = String(person.designation || '').trim();
    if (designationFilter === '__none__') {
      if (title) return false;
    } else if (designationFilter && title !== designationFilter) {
      return false;
    }
    if (!query) return true;
    const haystack = `${person.name} ${person.employeeId} ${person.email} ${person.designation || ''} ${role}`.toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Assign Tasks</h1>
          <p>Admin can assign work to managers and employees</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <form className="form" onSubmit={onAssign}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <div className="field">
              <label>Project name</label>
              <input
                value={form.projectName}
                onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Task</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Deadline</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Assign to (manager / employee)</label>
            {selected ? (
              <p className="muted" style={{ marginBottom: '0.35rem' }}>
                Selected: <EmployeeNameLink employee={selected} />
                {' · '}
                {selected.designation || 'No designation'}
                {' · '}
                {taskCountLabel(currentTaskCount(tasks, selected._id))}
                {' · '}
                {selected.userId?.role}
              </p>
            ) : (
              <p className="muted" style={{ marginBottom: '0.35rem' }}>Search and click a person below to assign</p>
            )}
            <div className="assignee-filters">
              <div className="field">
                <label>Search</label>
                <input
                  className="filter-search"
                  type="search"
                  placeholder="Name, employee ID, or email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Manager / Employee</label>
                <SearchableSelect
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  placeholder="All roles"
                  options={[
                    { value: '', label: 'All roles' },
                    { value: 'manager', label: 'Manager' },
                    { value: 'employee', label: 'Employee' },
                  ]}
                />
              </div>
              <div className="field">
                <label>Designation</label>
                <SearchableSelect
                  value={designationFilter}
                  onChange={(e) => setDesignationFilter(e.target.value)}
                  placeholder="All designations"
                  searchPlaceholder="Search designation…"
                  options={[
                    { value: '', label: 'All designations' },
                    { value: '__none__', label: 'No designation' },
                    ...designationOptions.map((title) => ({ value: title, label: title })),
                  ]}
                />
              </div>
            </div>
            <div className="assignee-picker" role="listbox" aria-label="Select assignee">
              {loadingPeople ? <div className="assignee-empty">Loading people…</div> : null}
              {!loadingPeople && !assignees.length ? (
                <div className="assignee-empty">No managers or employees found. Try logging in again.</div>
              ) : null}
              {!loadingPeople && assignees.length && !filteredAssignees.length ? (
                <div className="assignee-empty">No people match these filters</div>
              ) : null}
              {filteredAssignees.map((person) => (
                <div
                  key={person._id}
                  role="option"
                  tabIndex={0}
                  aria-selected={form.assignedTo === person._id}
                  className={`assignee-option ${form.assignedTo === person._id ? 'selected' : ''}`}
                  onClick={() => setForm({ ...form, assignedTo: person._id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setForm({ ...form, assignedTo: person._id });
                    }
                  }}
                >
                  <span>
                    <span className="name-row">
                      <span onClick={(e) => e.stopPropagation()}>
                        <EmployeeNameLink employee={person} />
                      </span>
                      <span className="name-extra">{person.designation || 'No designation'}</span>
                    </span>
                    <div className="meta">{person.employeeId} · {person.email} · {person.userId?.role}</div>
                  </span>
                  <span className="badge">{taskCountLabel(currentTaskCount(tasks, person._id))}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Notes (optional)</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <button className="btn" type="submit">Assign task</button>
        </form>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: '0.75rem' }}>All tasks</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project name</th>
                <th>Task</th>
                <th>Assigned to</th>
                <th>Role</th>
                <th>Deadline</th>
                <th>Date assigned</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task._id}>
                  <td>{task.projectName}</td>
                  <td>
                    <div>{task.title}</div>
                    {task.completionNote ? (
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        Note: {task.completionNote}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div><EmployeeNameLink employee={task.assignedTo} /></div>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      {task.assignedTo?.designation || 'No designation'}
                      {' · '}
                      {taskCountLabel(currentTaskCount(tasks, task.assignedTo?._id || task.assignedTo))}
                    </div>
                  </td>
                  <td><span className="badge">{task.assignedTo?.userId?.role || '—'}</span></td>
                  <td>{new Date(task.deadline).toLocaleDateString()}</td>
                  <td>{new Date(task.assignedAt).toLocaleDateString()}</td>
                  <td><span className="badge">{task.status}</span></td>
                  <td>
                    <button className="btn danger" onClick={() => removeTask(task._id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tasks.length ? <div className="empty">No tasks yet</div> : null}
        </div>
      </div>
    </div>
  );
}

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
  const [team, setTeam] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoadingPeople(true);
    const [teamRes, teamTasksRes, myTasksRes] = await Promise.all([
      api('/employees'),
      api('/tasks?scope=team'),
      api('/tasks?scope=mine'),
    ]);
    const members = (teamRes.data.items || []).filter((e) => {
      const role = typeof e.userId === 'object' ? e.userId?.role : null;
      return role !== 'manager' && role !== 'admin';
    });
    setTeam(members);
    setTeamTasks(teamTasksRes.data || []);
    setMyTasks(myTasksRes.data || []);
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
      setError('Please select an employee from your team');
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
      setMessage('Task assigned to your employee');
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

  async function markDone(id) {
    setError('');
    try {
      await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status: 'completed' } });
      setMessage('Task marked as completed');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const selected = team.find((p) => p._id === form.assignedTo);
  const query = search.trim().toLowerCase();
  const designationOptions = useMemo(() => {
    const titles = new Set();
    team.forEach((member) => {
      const title = String(member.designation || '').trim();
      if (title) titles.add(title);
    });
    return [...titles].sort((a, b) => a.localeCompare(b));
  }, [team]);

  const filteredTeam = team.filter((member) => {
    const title = String(member.designation || '').trim();
    if (designationFilter === '__none__') {
      if (title) return false;
    } else if (designationFilter && title !== designationFilter) {
      return false;
    }
    if (!query) return true;
    const haystack = `${member.name} ${member.employeeId} ${member.email} ${member.designation || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Assign Tasks</h1>
          <p>You can assign tasks only to employees who report to you</p>
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
            <label>Assign to employee</label>
            {selected ? (
              <p className="muted" style={{ marginBottom: '0.35rem' }}>
                Selected: <EmployeeNameLink employee={selected} />
                {' · '}
                {selected.designation || 'No designation'}
                {' · '}
                {taskCountLabel(currentTaskCount(teamTasks, selected._id))}
              </p>
            ) : (
              <p className="muted" style={{ marginBottom: '0.35rem' }}>Search and click an employee below to assign</p>
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
            <div className="assignee-picker" role="listbox" aria-label="Select employee">
              {loadingPeople ? <div className="assignee-empty">Loading team…</div> : null}
              {!loadingPeople && !team.length ? (
                <div className="assignee-empty">No employees are assigned under you yet.</div>
              ) : null}
              {!loadingPeople && team.length && !filteredTeam.length ? (
                <div className="assignee-empty">No employees match these filters</div>
              ) : null}
              {filteredTeam.map((member) => (
                <div
                  key={member._id}
                  role="option"
                  tabIndex={0}
                  aria-selected={form.assignedTo === member._id}
                  className={`assignee-option ${form.assignedTo === member._id ? 'selected' : ''}`}
                  onClick={() => setForm({ ...form, assignedTo: member._id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setForm({ ...form, assignedTo: member._id });
                    }
                  }}
                >
                  <span>
                    <span className="name-row">
                      <span onClick={(e) => e.stopPropagation()}>
                        <EmployeeNameLink employee={member} />
                      </span>
                      <span className="name-extra">{member.designation || 'No designation'}</span>
                    </span>
                    <div className="meta">{member.employeeId} · {member.email}</div>
                  </span>
                  <span className="badge">{taskCountLabel(currentTaskCount(teamTasks, member._id))}</span>
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
          <button className="btn" type="submit" disabled={!team.length}>
            Assign task
          </button>
        </form>
      </div>

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>My tasks (from Admin)</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project name</th>
                <th>Task</th>
                <th>Deadline</th>
                <th>Date assigned</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {myTasks.map((task) => (
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
                  <td>{new Date(task.deadline).toLocaleDateString()}</td>
                  <td>{new Date(task.assignedAt).toLocaleDateString()}</td>
                  <td><span className="badge">{task.status}</span></td>
                  <td className="row-actions">
                    {task.status !== 'completed' ? (
                      <button className="btn secondary" onClick={() => markDone(task._id)}>Mark done</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!myTasks.length ? <div className="empty">No tasks assigned to you</div> : null}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: '0.75rem' }}>Tasks assigned to my employees</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project name</th>
                <th>Task</th>
                <th>Employee</th>
                <th>Deadline</th>
                <th>Date assigned</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {teamTasks.map((task) => (
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
                      {taskCountLabel(currentTaskCount(teamTasks, task.assignedTo?._id || task.assignedTo))}
                    </div>
                  </td>
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
          {!teamTasks.length ? <div className="empty">No team tasks yet</div> : null}
        </div>
      </div>
    </div>
  );
}

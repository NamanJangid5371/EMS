import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function OrganizationPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/org/tree')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Organization</h1>
          <p>Admin → Manager → Employee hierarchy</p>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {!data && !error ? <div className="panel">Loading organization…</div> : null}
      <div className="org-admin-card panel">
        <strong>Admin</strong>
        <span>Command center for people, attendance, leave, and reports</span>
      </div>
      <div className="org-grid">
        {(data?.departments || []).map((dept) => (
          <div className="panel org-dept" key={dept._id}>
            <h3>
              <Link to={`/departments/${dept._id}`}>{dept.name}</Link>
            </h3>
            {dept.manager ? (
              <div className="org-manager">
                <span className="muted">Manager</span>
                <Link to={`/employees/${dept.manager._id}`}>{dept.manager.name}</Link>
                <small>{dept.manager.employeeId}</small>
              </div>
            ) : (
              <div className="muted">No manager assigned</div>
            )}
            <div className="org-people">
              {(dept.employees || []).map((emp) => (
                <Link key={emp._id} className="org-person" to={`/employees/${emp._id}`}>
                  <strong>{emp.name}</strong>
                  <span>{emp.designation || emp.role}</span>
                </Link>
              ))}
              {!(dept.employees || []).length ? <div className="empty">No employees in this department</div> : null}
            </div>
          </div>
        ))}
      </div>
      {(data?.unassigned || []).length ? (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <h3>Unassigned</h3>
          <div className="org-people" style={{ marginTop: '0.75rem' }}>
            {data.unassigned.map((emp) => (
              <Link key={emp._id} className="org-person" to={`/employees/${emp._id}`}>
                <strong>{emp.name}</strong>
                <span>{emp.designation || emp.role}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import EmployeeNameLink from '../components/EmployeeNameLink';

function statusLabel(value) {
  return String(value || '—').replace(/_/g, ' ');
}

export default function DepartmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [department, setDepartment] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api(`/departments/${id}`)
      .then((res) => {
        setDepartment(res.data.department);
        setMembers(res.data.members || []);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (!department && !error) {
    return <div className="panel">Loading department…</div>;
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <p className="muted" style={{ marginBottom: '0.35rem' }}>
            <Link to="/departments">Departments</Link>
            {' / '}
            Members
          </p>
          <h1>{department?.name || 'Department'}</h1>
          <p>{department?.description || 'Department members and details'}</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => navigate('/departments')}>
          Back to departments
        </button>
      </div>

      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      {department ? (
        <div className="grid stats" style={{ marginBottom: '1rem' }}>
          <div className="stat">
            <div className="label">Members</div>
            <div className="value">{members.length}</div>
          </div>
          <div className="stat">
            <div className="label">Status</div>
            <div className="value" style={{ fontSize: '1.1rem' }}>
              <span className={`badge ${department.status}`}>{department.status}</span>
            </div>
          </div>
          <div className="stat">
            <div className="label">Department manager</div>
            <div className="value" style={{ fontSize: '1rem' }}>
              {department.managerId?._id ? (
                <EmployeeNameLink employee={department.managerId} />
              ) : (
                '—'
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <h3 style={{ marginBottom: '0.75rem' }}>Department members</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Role</th>
                <th>Designation</th>
                <th>Email</th>
                <th>Manager</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member._id}>
                  <td>
                    <EmployeeNameLink employee={member} />
                  </td>
                  <td>{member.employeeId || '—'}</td>
                  <td><span className="badge">{member.userId?.role || 'employee'}</span></td>
                  <td>{member.designation || '—'}</td>
                  <td>{member.email || '—'}</td>
                  <td>
                    {member.managerId?._id ? (
                      <EmployeeNameLink employee={member.managerId} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={`badge ${member.employmentStatus}`}>
                      {statusLabel(member.employmentStatus)}
                    </span>
                  </td>
                  <td>
                    <Link className="btn" to={`/employees/${member._id}`}>View profile</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!members.length ? <div className="empty">No members in this department yet</div> : null}
        </div>
      </div>
    </div>
  );
}

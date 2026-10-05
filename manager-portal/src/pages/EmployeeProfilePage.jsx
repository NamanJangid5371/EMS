import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import ProfileAttendanceCalendar from '../components/ProfileAttendanceCalendar';
import PerformanceChart from '../components/PerformanceChart';
import SearchableSelect from '../components/SearchableSelect';

function dateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function emptyForm() {
  return {
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    designation: '',
    departmentId: '',
    joiningDate: '',
    dateOfBirth: '',
    employmentStatus: 'active',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelation: '',
    leaveAnnual: 18,
    leaveSick: 10,
    leaveCasual: 6,
    bankAccountHolder: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    gradDegree: '',
    gradInstitution: '',
    gradUniversity: '',
    gradYear: '',
    pgDegree: '',
    pgInstitution: '',
    pgUniversity: '',
    pgYear: '',
    perfTask: '',
    perfAttendance: '',
    perfQuality: '',
    perfAptitude: '',
    perfRemarks: '',
  };
}

function formFromEmployee(emp) {
  return {
    employeeId: emp.employeeId || '',
    name: emp.name || '',
    email: emp.email || emp.userId?.email || '',
    phone: emp.phone || '',
    designation: emp.designation || '',
    departmentId: emp.departmentId?._id || emp.departmentId || '',
    joiningDate: dateInputValue(emp.joiningDate),
    dateOfBirth: dateInputValue(emp.dateOfBirth),
    employmentStatus: emp.employmentStatus || 'active',
    emergencyName: emp.emergencyContact?.name || '',
    emergencyPhone: emp.emergencyContact?.phone || '',
    emergencyRelation: emp.emergencyContact?.relation || '',
    leaveAnnual: emp.leaveBalance?.annual ?? 18,
    leaveSick: emp.leaveBalance?.sick ?? 10,
    leaveCasual: emp.leaveBalance?.casual ?? 6,
    bankAccountHolder: emp.bankDetails?.accountHolderName || '',
    bankName: emp.bankDetails?.bankName || '',
    bankAccountNumber: emp.bankDetails?.accountNumber || '',
    bankIfsc: emp.bankDetails?.ifscCode || '',
    bankBranch: emp.bankDetails?.branchName || '',
    gradDegree: emp.education?.graduation?.degree || '',
    gradInstitution: emp.education?.graduation?.institution || '',
    gradUniversity: emp.education?.graduation?.university || '',
    gradYear: emp.education?.graduation?.year || '',
    pgDegree: emp.education?.postGraduation?.degree || '',
    pgInstitution: emp.education?.postGraduation?.institution || '',
    pgUniversity: emp.education?.postGraduation?.university || '',
    pgYear: emp.education?.postGraduation?.year || '',
    perfTask: emp.performance?.taskCompletion ?? '',
    perfAttendance: emp.performance?.monthlyAttendance ?? '',
    perfQuality: emp.performance?.workQuality ?? '',
    perfAptitude: emp.performance?.aptitude ?? '',
    perfRemarks: emp.performance?.remarks || '',
  };
}

function InfoRow({ label, children }) {
  return (
    <div className="profile-row">
      <span className="muted">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteKind, setNoteKind] = useState('comment');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [profileTab, setProfileTab] = useState('overview');
  const [activity, setActivity] = useState([]);

  async function load() {
    const empRes = await api(`/employees/${id}`);
    const emp = empRes.data;
    setEmployee(emp);
    setForm(formFromEmployee(emp));
    const [deps, leaveRes, activityRes] = await Promise.all([
      api('/departments').catch(() => ({ data: [] })),
      api(`/employees/${id}/leave-record`).catch(() => ({ data: { leaves: [], absences: [] } })),
      api(`/employees/${id}/activity`).catch(() => ({ data: { items: [] } })),
    ]);
    setDepartments(deps.data || []);
    setLeaves(leaveRes.data.leaves || []);
    setAbsences(leaveRes.data.absences || []);
    setActivity(activityRes.data.items || []);
  }

  useEffect(() => {
    setEditing(false);
    setError('');
    setMessage('');
    load().catch((err) => setError(err.message));
  }, [id]);

  function startEdit() {
    if (!employee) return;
    setForm(formFromEmployee(employee));
    setEditing(true);
    setError('');
    setMessage('');
  }

  function cancelEdit() {
    if (employee) setForm(formFromEmployee(employee));
    setEditing(false);
  }

  function performancePayload() {
    return {
      taskCompletion: form.perfTask === '' ? null : Number(form.perfTask),
      monthlyAttendance: form.perfAttendance === '' ? null : Number(form.perfAttendance),
      workQuality: form.perfQuality === '' ? null : Number(form.perfQuality),
      aptitude: form.perfAptitude === '' ? null : Number(form.perfAptitude),
      remarks: form.perfRemarks.trim(),
    };
  }

  async function addNote(e) {
    e.preventDefault();
    if (!employee?._id) return;
    const text = noteText.trim();
    if (!text) {
      setError('Enter a comment or remark');
      return;
    }
    setError('');
    setMessage('');
    setSavingNote(true);
    try {
      const res = await api(`/employees/${employee._id}/notes`, {
        method: 'POST',
        body: { kind: noteKind, text },
      });
      setEmployee(res.data);
      setNoteText('');
      setMessage(res.message || 'Note added');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingNote(false);
    }
  }

  async function savePerformance(e) {
    e.preventDefault();
    if (!employee?._id) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await api(`/employees/${employee._id}`, {
        method: 'PUT',
        body: { performance: performancePayload() },
      });
      setEmployee(res.data);
      setForm(formFromEmployee(res.data));
      setMessage('Performance updated');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const body = {
        employeeId: form.employeeId.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        designation: form.designation.trim(),
        departmentId: form.departmentId || null,
        joiningDate: form.joiningDate || null,
        dateOfBirth: form.dateOfBirth || null,
        employmentStatus: form.employmentStatus,
        emergencyContact: {
          name: form.emergencyName.trim(),
          phone: form.emergencyPhone.trim(),
          relation: form.emergencyRelation.trim(),
        },
        leaveBalance: {
          annual: Number(form.leaveAnnual) || 0,
          sick: Number(form.leaveSick) || 0,
          casual: Number(form.leaveCasual) || 0,
        },
        bankDetails: {
          accountHolderName: form.bankAccountHolder.trim(),
          bankName: form.bankName.trim(),
          accountNumber: form.bankAccountNumber.trim(),
          ifscCode: form.bankIfsc.trim(),
          branchName: form.bankBranch.trim(),
        },
        education: {
          graduation: {
            degree: form.gradDegree.trim(),
            institution: form.gradInstitution.trim(),
            university: form.gradUniversity.trim(),
            year: form.gradYear.trim(),
          },
          postGraduation: {
            degree: form.pgDegree.trim(),
            institution: form.pgInstitution.trim(),
            university: form.pgUniversity.trim(),
            year: form.pgYear.trim(),
          },
        },
        performance: performancePayload(),
      };

      const res = await api(`/employees/${id}`, { method: 'PUT', body });
      setEmployee(res.data);
      setForm(formFromEmployee(res.data));
      setEditing(false);
      setMessage(res.message || 'Profile saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!employee && !error) {
    return <div className="panel">Loading profile…</div>;
  }

  const role = employee?.userId?.role || 'employee';

  return (
    <div>
      <div className="topbar">
        <div>
          <p className="muted" style={{ marginBottom: '0.35rem' }}>
            <Link to="/team">My Team</Link>
            {' / '}
            Profile
          </p>
          <h1>{employee?.name || 'Employee profile'}</h1>
          <p>
            {employee?.employeeId || ''}
            {role ? ` · ${role}` : ''}
          </p>
        </div>
        <div className="row-actions">
          {!editing ? (
            <button className="btn" onClick={startEdit}>Edit profile</button>
          ) : (
            <button className="btn ghost" type="button" onClick={cancelEdit}>Cancel</button>
          )}
          <button className="btn secondary" type="button" onClick={() => navigate('/team')}>
            Back to team
          </button>
        </div>
      </div>

      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      {employee && !editing ? (
        <>
          <div className="profile-tabs">
            {[['overview', 'Overview'], ['attendance', 'Attendance'], ['leave', 'Leave'], ['documents', 'Documents'], ['activity', 'Activity']].map(([key, label]) => (
              <button key={key} type="button" className={`profile-tab ${profileTab === key ? 'active' : ''}`} onClick={() => setProfileTab(key)}>{label}</button>
            ))}
          </div>
          {profileTab === 'overview' ? (
          <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
            <div className="panel">
              <h3>Account</h3>
              <InfoRow label="Email">{employee.email || employee.userId?.email || '—'}</InfoRow>
              <InfoRow label="Employee ID">{employee.employeeId || '—'}</InfoRow>
              <InfoRow label="Role"><span className="badge">{role}</span></InfoRow>
              <InfoRow label="Account status">
                <span className={`badge ${employee.userId?.status || ''}`}>
                  {employee.userId?.status || '—'}
                </span>
              </InfoRow>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.65rem' }}>
                Login password can only be changed by Admin.
              </p>
            </div>

            <div className="panel">
              <h3>Personal information</h3>
              <InfoRow label="Full name">{employee.name || '—'}</InfoRow>
              <InfoRow label="Date of birth">{formatDate(employee.dateOfBirth)}</InfoRow>
              <InfoRow label="Phone">{employee.phone || '—'}</InfoRow>
              <InfoRow label="Designation">{employee.designation || '—'}</InfoRow>
              <InfoRow label="Joining date">{formatDate(employee.joiningDate)}</InfoRow>
            </div>

            <div className="panel">
              <h3>Organization</h3>
              <InfoRow label="Department">{employee.departmentId?.name || '—'}</InfoRow>
              <InfoRow label="Manager">{employee.managerId?.name || '—'}</InfoRow>
              <InfoRow label="Employment status">
                <span className={`badge ${employee.employmentStatus}`}>{employee.employmentStatus}</span>
              </InfoRow>
            </div>

            <div className="panel">
              <h3>Emergency contact</h3>
              <InfoRow label="Name">{employee.emergencyContact?.name || '—'}</InfoRow>
              <InfoRow label="Phone">{employee.emergencyContact?.phone || '—'}</InfoRow>
              <InfoRow label="Relation">{employee.emergencyContact?.relation || '—'}</InfoRow>
            </div>

            <div className="panel">
              <h3>Leave balance</h3>
              <div className="grid stats" style={{ marginTop: '0.5rem' }}>
                <div className="stat" style={{ padding: '0.75rem' }}>
                  <div className="label">Annual leave</div>
                  <div className="value" style={{ fontSize: '1.25rem' }}>{employee.leaveBalance?.annual ?? '—'}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
                </div>
                <div className="stat" style={{ padding: '0.75rem' }}>
                  <div className="label">Sick leave</div>
                  <div className="value" style={{ fontSize: '1.25rem' }}>{employee.leaveBalance?.sick ?? '—'}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
                </div>
                <div className="stat" style={{ padding: '0.75rem' }}>
                  <div className="label">Casual leave</div>
                  <div className="value" style={{ fontSize: '1.25rem' }}>{employee.leaveBalance?.casual ?? '—'}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
                </div>
              </div>
            </div>

            <div className="panel">
              <h3>Bank details</h3>
              <InfoRow label="Account holder">{employee.bankDetails?.accountHolderName || '—'}</InfoRow>
              <InfoRow label="Bank name">{employee.bankDetails?.bankName || '—'}</InfoRow>
              <InfoRow label="Account number">{employee.bankDetails?.accountNumber || '—'}</InfoRow>
              <InfoRow label="IFSC code">{employee.bankDetails?.ifscCode || '—'}</InfoRow>
              <InfoRow label="Branch">{employee.bankDetails?.branchName || '—'}</InfoRow>
            </div>

            <div className="panel">
              <h3>Education qualification</h3>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.65rem' }}>Graduation</p>
              <InfoRow label="Degree">{employee.education?.graduation?.degree || '—'}</InfoRow>
              <InfoRow label="Institution">{employee.education?.graduation?.institution || '—'}</InfoRow>
              <InfoRow label="University">{employee.education?.graduation?.university || '—'}</InfoRow>
              <InfoRow label="Year">{employee.education?.graduation?.year || '—'}</InfoRow>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '0.85rem 0 0.65rem' }}>Post graduation (optional)</p>
              <InfoRow label="Degree">{employee.education?.postGraduation?.degree || '—'}</InfoRow>
              <InfoRow label="Institution">{employee.education?.postGraduation?.institution || '—'}</InfoRow>
              <InfoRow label="University">{employee.education?.postGraduation?.university || '—'}</InfoRow>
              <InfoRow label="Year">{employee.education?.postGraduation?.year || '—'}</InfoRow>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.35rem' }}>Performance</h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.85rem' }}>
              Graphical review · only managers can rate these factors (0–10)
            </p>
            <PerformanceChart performance={employee.performance} updatedAt={employee.performance?.updatedAt} />
            <form className="form" onSubmit={savePerformance} style={{ marginTop: '1rem' }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <div className="field">
                  <label>Task completion vs deadline</label>
                  <input type="number" min="0" max="10" step="0.5" value={form.perfTask} onChange={(e) => setForm({ ...form, perfTask: e.target.value })} />
                </div>
                <div className="field">
                  <label>Monthly attendance</label>
                  <input type="number" min="0" max="10" step="0.5" value={form.perfAttendance} onChange={(e) => setForm({ ...form, perfAttendance: e.target.value })} />
                </div>
                <div className="field">
                  <label>Work quality</label>
                  <input type="number" min="0" max="10" step="0.5" value={form.perfQuality} onChange={(e) => setForm({ ...form, perfQuality: e.target.value })} />
                </div>
                <div className="field">
                  <label>Aptitude</label>
                  <input type="number" min="0" max="10" step="0.5" value={form.perfAptitude} onChange={(e) => setForm({ ...form, perfAptitude: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Remarks</label>
                <textarea rows={2} value={form.perfRemarks} onChange={(e) => setForm({ ...form, perfRemarks: e.target.value })} />
              </div>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save performance'}
              </button>
            </form>
          </div>

          <div className="panel" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.35rem' }}>Comments & remarks</h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.85rem' }}>
              Add a comment or remark for this employee. They can see it on their profile.
            </p>
            <form className="form" onSubmit={addNote}>
              <div className="grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <div className="field">
                  <label>Type</label>
                  <SearchableSelect
                    value={noteKind}
                    onChange={(e) => setNoteKind(e.target.value)}
                    options={[
                      { value: 'comment', label: 'Comment' },
                      { value: 'remark', label: 'Remark' },
                    ]}
                  />
                </div>
                <div className="field">
                  <label>Note</label>
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Write a comment or remark"
                    required
                  />
                </div>
              </div>
              <button className="btn" type="submit" disabled={savingNote}>
                {savingNote ? 'Saving…' : 'Add note'}
              </button>
            </form>
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Note</th>
                    <th>From</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(employee.managerNotes || []).map((note) => (
                    <tr key={note._id || `${note.createdAt}-${note.text}`}>
                      <td><span className="badge">{note.kind}</span></td>
                      <td>{note.text}</td>
                      <td>{note.authorName || 'Manager'}</td>
                      <td>{note.createdAt ? new Date(note.createdAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(employee.managerNotes || []).length ? (
                <div className="empty">No comments or remarks yet</div>
              ) : null}
            </div>
          </div>
          </>
          ) : null}

          {profileTab === 'attendance' ? (
          <div className="panel cal-box" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.2rem', fontSize: '1rem' }}>Attendance</h3>
            <p className="muted" style={{ marginBottom: '0.35rem', fontSize: '0.72rem' }}>
              Green · Red leave · Orange holiday · Grey absent
            </p>
            <ProfileAttendanceCalendar employeeId={employee._id} />
          </div>
          ) : null}

          {profileTab === 'leave' ? (
          <div className="panel" style={{ marginTop: '1rem' }}>
              <h3 style={{ marginBottom: '0.35rem' }}>Leave record</h3>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.85rem' }}>
                Approved leave and absent days · permanent profile record
              </p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', marginBottom: '1rem' }}>
                {['annual', 'sick', 'casual', 'unpaid'].map((type) => {
                  const taken = leaves
                    .filter((row) => row.status === 'approved' && row.type === type)
                    .reduce((sum, row) => sum + (Number(row.days) || 0), 0);
                  return (
                    <div key={type} className="stat" style={{ padding: '0.75rem' }}>
                      <div className="label">{type}</div>
                      <div className="value" style={{ fontSize: '1.25rem' }}>{taken}</div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>days taken</div>
                    </div>
                  );
                })}
                <div className="stat" style={{ padding: '0.75rem' }}>
                  <div className="label">absent</div>
                  <div className="value" style={{ fontSize: '1.25rem' }}>{absences.length}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>days recorded</div>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...leaves.filter((row) => row.status === 'approved').map((row) => ({
                        key: `leave-${row._id}`,
                        sort: new Date(row.startDate).getTime(),
                        type: row.type,
                        dates: `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`,
                        days: row.days,
                        status: row.status,
                      })),
                      ...absences.map((row) => ({
                        key: `absent-${row._id}`,
                        sort: new Date(row.date).getTime(),
                        type: 'absent',
                        dates: formatDate(row.date),
                        days: 1,
                        status: 'absent',
                      })),
                    ].sort((a, b) => b.sort - a.sort).map((row) => (
                      <tr key={row.key}>
                        <td>{row.type}</td>
                        <td>{row.dates}</td>
                        <td>{row.days}</td>
                        <td><span className={`badge ${row.status}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!leaves.filter((row) => row.status === 'approved').length && !absences.length ? (
                  <div className="empty">No leave or absent record yet</div>
                ) : null}
              </div>
          </div>
          ) : null}

          {profileTab === 'documents' ? (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <h3>Documents</h3>
              {(employee.documents || []).map((doc) => (
                <div key={doc._id} className="timeline-item" style={{ marginTop: '0.7rem' }}>
                  <strong>{doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">{doc.name}</a> : doc.name}</strong>
                  <div className="muted">{doc.note || new Date(doc.uploadedAt).toLocaleDateString()}</div>
                </div>
              ))}
              {!(employee.documents || []).length ? <div className="empty">No documents yet</div> : null}
            </div>
          ) : null}

          {profileTab === 'activity' ? (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <h3>Activity</h3>
              {activity.map((item, index) => (
                <div key={`${item.at}-${index}`} className="timeline-item" style={{ marginTop: '0.7rem' }}>
                  <strong>{item.title}</strong>
                  <div className="muted">{item.detail}</div>
                  <em>{item.at ? new Date(item.at).toLocaleString() : ''}</em>
                </div>
              ))}
              {!activity.length ? <div className="empty">No activity yet</div> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {employee && editing ? (
        <form className="form" onSubmit={onSave}>
          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Account</h3>
            <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              Shared employee record. Login password can only be changed by Admin.
            </p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Employee ID</label>
                <input
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Role</label>
                <input value={role} disabled />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Personal information</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div className="field">
                <label>Full name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Designation</label>
                <input
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                />
              </div>
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
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Organization</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div className="field">
                <label>Department</label>
                <SearchableSelect
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  options={[
                    { value: '', label: 'None' },
                    ...departments.map((d) => ({ value: d._id, label: d.name })),
                  ]}
                />
              </div>
              <div className="field">
                <label>Manager</label>
                <input value={employee.managerId?.name || '—'} disabled />
              </div>
              <div className="field">
                <label>Employment status</label>
                <SearchableSelect
                  value={form.employmentStatus}
                  onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'on_leave', label: 'On leave' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Emergency contact</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div className="field">
                <label>Name</label>
                <input
                  value={form.emergencyName}
                  onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  value={form.emergencyPhone}
                  onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Relation</label>
                <input
                  value={form.emergencyRelation}
                  onChange={(e) => setForm({ ...form, emergencyRelation: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Leave balance</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              <div className="field">
                <label>Annual</label>
                <input
                  type="number"
                  min="0"
                  value={form.leaveAnnual}
                  onChange={(e) => setForm({ ...form, leaveAnnual: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Sick</label>
                <input
                  type="number"
                  min="0"
                  value={form.leaveSick}
                  onChange={(e) => setForm({ ...form, leaveSick: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Casual</label>
                <input
                  type="number"
                  min="0"
                  value={form.leaveCasual}
                  onChange={(e) => setForm({ ...form, leaveCasual: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Bank details</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div className="field">
                <label>Account holder name</label>
                <input
                  value={form.bankAccountHolder}
                  onChange={(e) => setForm({ ...form, bankAccountHolder: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Bank name</label>
                <input
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Account number</label>
                <input
                  value={form.bankAccountNumber}
                  onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                />
              </div>
              <div className="field">
                <label>IFSC code</label>
                <input
                  value={form.bankIfsc}
                  onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Branch name</label>
                <input
                  value={form.bankBranch}
                  onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Education qualification</h3>
            <p className="muted" style={{ marginBottom: '0.65rem' }}>Graduation degree</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div className="field">
                <label>Degree</label>
                <input
                  placeholder="e.g. B.Tech, B.Com"
                  value={form.gradDegree}
                  onChange={(e) => setForm({ ...form, gradDegree: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Institution / College</label>
                <input
                  value={form.gradInstitution}
                  onChange={(e) => setForm({ ...form, gradInstitution: e.target.value })}
                />
              </div>
              <div className="field">
                <label>University</label>
                <input
                  value={form.gradUniversity}
                  onChange={(e) => setForm({ ...form, gradUniversity: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Year of passing</label>
                <input
                  placeholder="e.g. 2020"
                  value={form.gradYear}
                  onChange={(e) => setForm({ ...form, gradYear: e.target.value })}
                />
              </div>
            </div>
            <p className="muted" style={{ margin: '1rem 0 0.65rem' }}>Post graduation (optional)</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div className="field">
                <label>Degree</label>
                <input
                  placeholder="e.g. MBA, M.Tech"
                  value={form.pgDegree}
                  onChange={(e) => setForm({ ...form, pgDegree: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Institution / College</label>
                <input
                  value={form.pgInstitution}
                  onChange={(e) => setForm({ ...form, pgInstitution: e.target.value })}
                />
              </div>
              <div className="field">
                <label>University</label>
                <input
                  value={form.pgUniversity}
                  onChange={(e) => setForm({ ...form, pgUniversity: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Year of passing</label>
                <input
                  placeholder="e.g. 2022"
                  value={form.pgYear}
                  onChange={(e) => setForm({ ...form, pgYear: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: '0.85rem' }}>Performance</h3>
            <p className="muted" style={{ marginBottom: '0.65rem' }}>Rate each factor from 0 to 10</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              <div className="field">
                <label>Task completion vs deadline</label>
                <input type="number" min="0" max="10" step="0.5" value={form.perfTask} onChange={(e) => setForm({ ...form, perfTask: e.target.value })} />
              </div>
              <div className="field">
                <label>Monthly attendance</label>
                <input type="number" min="0" max="10" step="0.5" value={form.perfAttendance} onChange={(e) => setForm({ ...form, perfAttendance: e.target.value })} />
              </div>
              <div className="field">
                <label>Work quality</label>
                <input type="number" min="0" max="10" step="0.5" value={form.perfQuality} onChange={(e) => setForm({ ...form, perfQuality: e.target.value })} />
              </div>
              <div className="field">
                <label>Aptitude</label>
                <input type="number" min="0" max="10" step="0.5" value={form.perfAptitude} onChange={(e) => setForm({ ...form, perfAptitude: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Remarks</label>
              <textarea rows={3} value={form.perfRemarks} onChange={(e) => setForm({ ...form, perfRemarks: e.target.value })} />
            </div>
          </div>

          <div className="row-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            <button className="btn ghost" type="button" onClick={cancelEdit}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PerformanceChart from '../components/PerformanceChart';

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [emergency, setEmergency] = useState({ name: '', phone: '', relation: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [profileTab, setProfileTab] = useState('overview');
  const [activity, setActivity] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [editingDocId, setEditingDocId] = useState(null);

  async function hydrate(p) {
    setProfile(p);
    setPhone(p?.phone || '');
    setDateOfBirth(p?.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : '');
    setEmergency(p?.emergencyContact || { name: '', phone: '', relation: '' });
    if (!p?._id) return;
    const [act, leaveRes, att] = await Promise.all([
      api(`/employees/${p._id}/activity`).catch(() => ({ data: { items: [] } })),
      api(`/employees/${p._id}/leave-record`).catch(() => ({ data: { leaves: [], absences: [] } })),
      api('/attendance').catch(() => ({ data: { items: [] } })),
    ]);
    setActivity(act.data.items || []);
    setLeaves(leaveRes.data.leaves || []);
    setAbsences(leaveRes.data.absences || []);
    setAttendance(att.data.items || []);
  }

  useEffect(() => {
    if (!user?.profile?.id && !user?.profile?._id) {
      api('/auth/me')
        .then((res) => hydrate(res.data.profile))
        .catch((err) => setError(err.message));
      return;
    }
    const id = user.profile._id || user.profile.id;
    api(`/employees/${id}`)
      .then((res) => hydrate(res.data))
      .catch((err) => setError(err.message));
  }, [user]);

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const id = profile._id;
      const res = await api(`/employees/${id}`, {
        method: 'PUT',
        body: { phone, dateOfBirth: dateOfBirth || null, emergencyContact: emergency },
      });
      setProfile(res.data);
      setDateOfBirth(res.data?.dateOfBirth ? new Date(res.data.dateOfBirth).toISOString().slice(0, 10) : '');
      setMessage('Profile updated');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!profile && !error) return <div className="panel">Loading profile…</div>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>My Profile</h1>
          <p>Update permitted personal details</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}
      <div className="profile-tabs">
        {[['overview', 'Overview'], ['attendance', 'Attendance'], ['leave', 'Leave'], ['documents', 'Documents'], ['activity', 'Activity']].map(([key, label]) => (
          <button key={key} type="button" className={`profile-tab ${profileTab === key ? 'active' : ''}`} onClick={() => setProfileTab(key)}>{label}</button>
        ))}
      </div>
      {profileTab === 'overview' ? (
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
          <div><strong>Name</strong><p>{profile?.name}</p></div>
          <div><strong>Date of birth</strong><p>{profile?.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : '—'}</p></div>
          <div><strong>Employee ID</strong><p>{profile?.employeeId}</p></div>
          <div><strong>Email</strong><p>{profile?.email}</p></div>
          <div><strong>Designation</strong><p>{profile?.designation || '—'}</p></div>
          <div><strong>Department</strong><p>{profile?.departmentId?.name || '—'}</p></div>
          <div><strong>Manager</strong><p>{profile?.managerId?.name || '—'}</p></div>
        </div>
        <div className="grid stats" style={{ marginBottom: '1rem' }}>
          <div className="stat">
            <div className="label">Annual leave</div>
            <div className="value">{profile?.leaveBalance?.annual ?? '—'}</div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
          </div>
          <div className="stat">
            <div className="label">Sick leave</div>
            <div className="value">{profile?.leaveBalance?.sick ?? '—'}</div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
          </div>
          <div className="stat">
            <div className="label">Casual leave</div>
            <div className="value">{profile?.leaveBalance?.casual ?? '—'}</div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>days left</div>
          </div>
        </div>
        {(profile?.managerNotes || []).length ? (
          <div style={{ marginBottom: '1rem' }}>
            <strong>Manager comments & remarks</strong>
            <div className="table-wrap" style={{ marginTop: '0.65rem' }}>
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
                  {profile.managerNotes.map((note) => (
                    <tr key={note._id || `${note.createdAt}-${note.text}`}>
                      <td><span className="badge">{note.kind}</span></td>
                      <td>{note.text}</td>
                      <td>{note.authorName || 'Manager'}</td>
                      <td>{note.createdAt ? new Date(note.createdAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>Bank details</strong>
          </div>
          <div><span className="muted">Account holder</span><p>{profile?.bankDetails?.accountHolderName || '—'}</p></div>
          <div><span className="muted">Bank name</span><p>{profile?.bankDetails?.bankName || '—'}</p></div>
          <div><span className="muted">Account number</span><p>{profile?.bankDetails?.accountNumber || '—'}</p></div>
          <div><span className="muted">IFSC code</span><p>{profile?.bankDetails?.ifscCode || '—'}</p></div>
          <div><span className="muted">Branch</span><p>{profile?.bankDetails?.branchName || '—'}</p></div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>Education qualification</strong>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span className="muted">Graduation degree</span>
          </div>
          <div><span className="muted">Degree</span><p>{profile?.education?.graduation?.degree || '—'}</p></div>
          <div><span className="muted">Institution</span><p>{profile?.education?.graduation?.institution || '—'}</p></div>
          <div><span className="muted">University</span><p>{profile?.education?.graduation?.university || '—'}</p></div>
          <div><span className="muted">Year</span><p>{profile?.education?.graduation?.year || '—'}</p></div>
          <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
            <span className="muted">Post graduation (optional)</span>
          </div>
          <div><span className="muted">Degree</span><p>{profile?.education?.postGraduation?.degree || '—'}</p></div>
          <div><span className="muted">Institution</span><p>{profile?.education?.postGraduation?.institution || '—'}</p></div>
          <div><span className="muted">University</span><p>{profile?.education?.postGraduation?.university || '—'}</p></div>
          <div><span className="muted">Year</span><p>{profile?.education?.postGraduation?.year || '—'}</p></div>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <strong>Performance</strong>
          <p className="muted" style={{ margin: '0.25rem 0 0.75rem', fontSize: '0.85rem' }}>
            Rated by your manager · scores out of 10
          </p>
          <PerformanceChart performance={profile?.performance} updatedAt={profile?.performance?.updatedAt} />
        </div>
        <form className="form" onSubmit={onSave}>
          <div className="field">
            <label>Date of birth</label>
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>Emergency contact name</label>
            <input value={emergency.name || ''} onChange={(e) => setEmergency({ ...emergency, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Emergency contact phone</label>
            <input value={emergency.phone || ''} onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })} />
          </div>
          <div className="field">
            <label>Relation</label>
            <input value={emergency.relation || ''} onChange={(e) => setEmergency({ ...emergency, relation: e.target.value })} />
          </div>
          <button className="btn">Save changes</button>
        </form>
      </div>
      ) : null}
      {profileTab === 'attendance' ? (
        <div className="panel">
          <h3>Attendance summary</h3>
          {(attendance || []).slice(0, 20).map((row) => (
            <div key={row._id} className="timeline-item" style={{ marginTop: '0.7rem' }}>
              <strong>{new Date(row.date).toLocaleDateString()} · {String(row.status || '').replace(/_/g, ' ')}</strong>
              <div className="muted">{row.checkIn ? new Date(row.checkIn).toLocaleTimeString() : 'No login'}{row.checkOut ? ` – ${new Date(row.checkOut).toLocaleTimeString()}` : ''}</div>
            </div>
          ))}
          {!attendance.length ? <div className="empty">No attendance yet</div> : null}
        </div>
      ) : null}
      {profileTab === 'leave' ? (
        <div className="panel">
          <h3>Leave record</h3>
          <p className="muted" style={{ marginBottom: '0.85rem' }}>
            Approved leave and absent days
          </p>
          {(() => {
            const items = [
              ...(leaves || []).filter((row) => row.status === 'approved').map((row) => ({
                key: `leave-${row._id}`,
                sort: new Date(row.startDate).getTime(),
                title: `${row.type} · ${row.days} day(s)`,
                detail: `${new Date(row.startDate).toLocaleDateString()} – ${new Date(row.endDate).toLocaleDateString()}`,
                status: 'approved',
              })),
              ...(absences || []).map((row) => ({
                key: `absent-${row._id}`,
                sort: new Date(row.date).getTime(),
                title: 'Absent · 1 day',
                detail: new Date(row.date).toLocaleDateString(),
                status: 'absent',
              })),
            ].sort((a, b) => b.sort - a.sort);
            return items.length ? items.map((row) => (
              <div key={row.key} className="timeline-item" style={{ marginTop: '0.7rem' }}>
                <strong>{row.title}</strong>
                <div className="muted">{row.detail}</div>
                <span className={`badge ${row.status}`}>{row.status}</span>
              </div>
            )) : <div className="empty">No leave or absent record yet</div>;
          })()}
        </div>
      ) : null}
      {profileTab === 'documents' ? (
        <div className="panel">
          <h3>Documents</h3>
          <p className="muted" style={{ marginBottom: '0.85rem' }}>
            Add or edit a document name and its https:// link
          </p>
          <form className="form" onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setMessage('');
            try {
              const res = editingDocId
                ? await api(`/employees/${profile._id}/documents/${editingDocId}`, {
                  method: 'PUT',
                  body: { name: docName, url: docUrl },
                })
                : await api(`/employees/${profile._id}/documents`, {
                  method: 'POST',
                  body: { name: docName, url: docUrl },
                });
              setProfile(res.data);
              setDocName('');
              setDocUrl('');
              setEditingDocId(null);
              setMessage(editingDocId ? 'Document updated' : 'Document added');
            } catch (err) {
              setError(err.message);
            }
          }}>
            <div className="field"><label>Name</label><input value={docName} onChange={(e) => setDocName(e.target.value)} required /></div>
            <div className="field">
              <label>URL</label>
              <input
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
              />
            </div>
            <div className="row-actions">
              <button className="btn" type="submit">{editingDocId ? 'Save changes' : 'Add document link'}</button>
              {editingDocId ? (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setEditingDocId(null);
                    setDocName('');
                    setDocUrl('');
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          {(profile?.documents || []).map((doc) => (
            <div key={doc._id} className="timeline-item" style={{ marginTop: '0.7rem' }}>
              <strong>{doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">{doc.name}</a> : doc.name}</strong>
              <div className="muted">{doc.note || new Date(doc.uploadedAt).toLocaleDateString()}</div>
              {doc.url ? <div className="muted" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>{doc.url}</div> : null}
              <div className="row-actions" style={{ marginTop: '0.4rem' }}>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setError('');
                    setMessage('');
                    setEditingDocId(doc._id);
                    setDocName(doc.name || '');
                    setDocUrl(doc.url || '');
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
          {!(profile?.documents || []).length ? <div className="empty">No documents yet</div> : null}
        </div>
      ) : null}
      {profileTab === 'activity' ? (
        <div className="panel">
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
    </div>
  );
}

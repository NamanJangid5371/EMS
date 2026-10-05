import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';

function InfoRow({ label, children }) {
  return (
    <div className="profile-row">
      <span className="muted">{label}</span>
      <strong>{children || '—'}</strong>
    </div>
  );
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export default function HireRequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');

  async function load() {
    const res = await api(`/hire-requests/${id}`);
    setRequest(res.data);
  }

  useEffect(() => {
    setError('');
    setMessage('');
    load().catch((err) => setError(err.message));
  }, [id]);

  async function decide(status) {
    setError('');
    setMessage('');
    const note = decisionNote.trim();
    if (!note) {
      setError('Enter a reason before approving or rejecting');
      return;
    }
    setBusy(true);
    try {
      const res = await api(`/hire-requests/${id}/status`, {
        method: 'PUT',
        body: { status, decisionNote: note },
      });
      setRequest(res.data);
      setDecisionNote('');
      setMessage(res.message || `Hire request ${status}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!request && !error) {
    return <div className="panel">Loading…</div>;
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <p className="muted" style={{ marginBottom: '0.35rem' }}>
            <Link to="/hire-requests">Hire requests</Link>
          </p>
          <h1>{request?.name || 'Hire request'}</h1>
          <p>Profile submitted by {request?.requestedBy?.name || 'manager'}</p>
        </div>
        <button className="btn ghost" type="button" onClick={() => navigate('/hire-requests')}>
          Back to list
        </button>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      {request ? (
        <>
          {request.status === 'pending' ? (
            <div className="panel" style={{ marginBottom: '1rem' }}>
              <span className="badge pending" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>pending</span>
              <h3 style={{ marginBottom: '0.35rem' }}>Decision reason</h3>
              <p className="muted" style={{ marginBottom: '0.75rem' }}>
                Required for both approve and reject. This reason is shown to the manager.
              </p>
              <div className="field">
                <label>Reason</label>
                <textarea
                  rows={4}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Explain why you are approving or rejecting this hire"
                  required
                />
              </div>
              <div className="row-actions" style={{ marginTop: '0.75rem' }}>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => decide('approved')}>
                  {busy ? 'Saving…' : 'Approve'}
                </button>
                <button className="btn danger" type="button" disabled={busy} onClick={() => decide('rejected')}>
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ marginBottom: '1rem' }}>
              <span className={`badge ${request.status}`}>{request.status}</span>
              {request.decisionNote ? (
                <p style={{ marginTop: '0.75rem' }}>
                  <span className="muted">Decision reason: </span>
                  {request.decisionNote}
                </p>
              ) : null}
              {request.createdEmployeeId?._id ? (
                <p style={{ marginTop: '0.75rem' }}>
                  <Link to={`/employees/${request.createdEmployeeId._id}`}>Open employee profile</Link>
                </p>
              ) : null}
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1rem' }}>
            <div className="panel">
              <h3>Proposed login</h3>
              <InfoRow label="Employee ID">{request.employeeId}</InfoRow>
              <InfoRow label="Email">{request.email}</InfoRow>
              <InfoRow label="Temp password">{request.loginPassword}</InfoRow>
            </div>
            <div className="panel">
              <h3>Assignment</h3>
              <InfoRow label="Department">{request.departmentId?.name}</InfoRow>
              <InfoRow label="Manager">{request.managerId?.name}</InfoRow>
              <InfoRow label="Requested by">{request.requestedBy?.name}</InfoRow>
              <InfoRow label="Joining date">{formatDate(request.joiningDate)}</InfoRow>
            </div>
            <div className="panel">
              <h3>Profile</h3>
              <InfoRow label="Name">{request.name}</InfoRow>
              <InfoRow label="Date of birth">{formatDate(request.dateOfBirth)}</InfoRow>
              <InfoRow label="Phone">{request.phone}</InfoRow>
              <InfoRow label="Designation">{request.designation}</InfoRow>
            </div>
            <div className="panel">
              <h3>Emergency contact</h3>
              <InfoRow label="Name">{request.emergencyContact?.name}</InfoRow>
              <InfoRow label="Phone">{request.emergencyContact?.phone}</InfoRow>
              <InfoRow label="Relation">{request.emergencyContact?.relation}</InfoRow>
            </div>
          </div>

          {request.managerNote ? (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <h3>Manager note</h3>
              <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{request.managerNote}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

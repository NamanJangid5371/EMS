import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [leaveEmail, setLeaveEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/settings')
      .then((res) => setLeaveEmail(res.data.leaveNotificationEmail || ''))
      .catch((err) => setError(err.message));
  }, []);

  async function onPassword(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setMessage('Password updated');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function onNotification(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api('/settings', {
        method: 'PUT',
        body: { leaveNotificationEmail: leaveEmail },
      });
      setLeaveEmail(res.data.leaveNotificationEmail || leaveEmail);
      setMessage('Leave notification email updated');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Account security and leave notifications</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      <div className="panel" style={{ maxWidth: 520, marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Leave notification email</h3>
        <p className="muted" style={{ marginBottom: '0.85rem' }}>
          Leave applications from employees and managers are emailed here. The applicant&apos;s
          contact email is included so you can reply directly.
        </p>
        <form className="form" onSubmit={onNotification}>
          <div className="field">
            <label>Recipient email</label>
            <input
              type="email"
              value={leaveEmail}
              onChange={(e) => setLeaveEmail(e.target.value)}
              placeholder="admin@company.com"
              required
            />
          </div>
          <button className="btn">Save notification email</button>
        </form>
      </div>

      <div className="panel" style={{ maxWidth: 520 }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Account security</h3>
        <form className="form" onSubmit={onPassword}>
          <div className="field">
            <label>Current password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
          </div>
          <button className="btn">Update password</button>
        </form>
      </div>
    </div>
  );
}

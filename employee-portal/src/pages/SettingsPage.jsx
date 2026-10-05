import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const profileId = user?.profile?._id || user?.employeeProfile || null;
  const [notificationEmail, setNotificationEmail] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    api(`/employees/${profileId}`)
      .then((res) => {
        setOfficialEmail(res.data.email || '');
        setNotificationEmail(res.data.notificationEmail || res.data.email || '');
      })
      .catch((err) => setError(err.message));
  }, [profileId]);

  async function onNotificationEmail(e) {
    e.preventDefault();
    if (!profileId) {
      setError('No employee profile linked to this account');
      return;
    }
    setError('');
    setMessage('');
    setLoadingEmail(true);
    try {
      const res = await api(`/employees/${profileId}`, {
        method: 'PUT',
        body: { notificationEmail: notificationEmail.trim() },
      });
      setNotificationEmail(res.data.notificationEmail || notificationEmail.trim());
      setOfficialEmail(res.data.email || officialEmail);
      setMessage('Leave contact email saved. Leave applications will use this address for admin and manager replies.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingEmail(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Leave contact email</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {message ? <div className="success" style={{ marginBottom: '1rem' }}>{message}</div> : null}

      <div className="panel" style={{ maxWidth: 520, marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Leave notification email</h3>
        <p className="muted" style={{ marginBottom: '0.85rem' }}>
          When you apply for leave, a professional email is sent to Admin
          {user?.role === 'employee' ? ' and your Manager' : ''}. Set the email address
          you want them to reply to.
        </p>
        <form className="form" onSubmit={onNotificationEmail}>
          <div className="field">
            <label>Official account email</label>
            <input type="email" value={officialEmail} disabled />
          </div>
          <div className="field">
            <label>Email used for leave messages</label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>
          <button className="btn" type="submit" disabled={loadingEmail || !profileId}>
            {loadingEmail ? 'Saving…' : 'Save leave email'}
          </button>
        </form>
      </div>

      <div className="panel" style={{ maxWidth: 520 }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Password</h3>
        <p className="muted">
          Only an admin can change or reset your password. Contact your admin if you need a new one.
        </p>
      </div>
    </div>
  );
}

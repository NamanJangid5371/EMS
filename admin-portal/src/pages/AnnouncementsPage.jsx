import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AnnouncementsPage() {
  const [items, setItems] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function load() {
    const [announcements, holidayRes] = await Promise.all([
      api('/announcements'),
      api('/holidays'),
    ]);
    setItems(announcements.data || []);
    setHolidays(holidayRes.data?.items || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      await api('/announcements', {
        method: 'POST',
        body: { title, message, audience: 'company' },
      });
      setTitle('');
      setMessage('');
      setSuccessMessage('Announcement published');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onAddHoliday(e) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      const res = await api('/holidays', { method: 'POST', body: holidayForm });
      setHolidayForm({ date: '', name: '' });
      setSuccessMessage(res.message || 'Holiday added and announced');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeHoliday(item) {
    const confirmed = confirm(`Remove holiday "${item.name}"?`);
    if (!confirmed) return;
    setError('');
    setSuccessMessage('');
    try {
      await api(`/holidays/${item._id}`, { method: 'DELETE' });
      setSuccessMessage('Holiday removed');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeAnnouncement(item) {
    const confirmed = confirm(`Remove announcement "${item.title}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;
    setError('');
    setSuccessMessage('');
    try {
      const res = await api(`/announcements/${item._id}`, { method: 'DELETE' });
      setSuccessMessage(res.message || 'Announcement removed');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Announcements</h1>
          <p>Company-wide notices and holiday calendar</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {successMessage ? <div className="success" style={{ marginBottom: '1rem' }}>{successMessage}</div> : null}

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Company holidays</h3>
        <p className="muted" style={{ marginBottom: '0.85rem' }}>
          Orange days on employee attendance calendars. Adding a holiday also publishes a company announcement.
        </p>
        <form className="form" onSubmit={onAddHoliday}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Holiday name</label>
              <input
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                placeholder="e.g. Diwali"
                required
              />
            </div>
          </div>
          <button className="btn" type="submit">Add holiday</button>
        </form>
        <div className="table-wrap" style={{ marginTop: '0.85rem' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h._id}>
                  <td>{new Date(h.date).toLocaleDateString()}</td>
                  <td>{h.name}</td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => removeHoliday(h)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!holidays.length ? <div className="empty">No holidays yet</div> : null}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Publish announcement</h3>
        <form className="form" onSubmit={onCreate}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} required />
          </div>
          <button className="btn">Publish</button>
        </form>
      </div>
      <div className="stack">
        {items.map((a) => (
          <div className="panel" key={a._id}>
            <div className="topbar" style={{ marginBottom: '0.35rem' }}>
              <h3 style={{ margin: 0 }}>{a.title}</h3>
              <button className="btn danger" type="button" onClick={() => removeAnnouncement(a)}>
                Remove
              </button>
            </div>
            <p>{a.message}</p>
            <div className="muted" style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
              {a.audience} · {new Date(a.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

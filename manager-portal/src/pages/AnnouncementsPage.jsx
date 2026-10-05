import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AnnouncementsPage() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const res = await api('/announcements');
    setItems(res.data || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    try {
      await api('/announcements', {
        method: 'POST',
        body: { title, message, audience: 'team' },
      });
      setTitle('');
      setMessage('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Team Announcements</h1>
          <p>Publish updates for your department</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <form className="form" onSubmit={onCreate}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} required />
          </div>
          <button className="btn">Publish to team</button>
        </form>
      </div>
      <div className="stack">
        {items.map((a) => (
          <div className="panel" key={a._id}>
            <h3>{a.title}</h3>
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

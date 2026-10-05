import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AnnouncementsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/announcements')
      .then((res) => setItems(res.data || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Announcements</h1>
          <p>Company and team updates</p>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
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
        {!items.length ? <div className="panel empty">No announcements</div> : null}
      </div>
    </div>
  );
}

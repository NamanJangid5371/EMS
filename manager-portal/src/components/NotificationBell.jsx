import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    const res = await api('/notifications?limit=12');
    setItems(res.data.items || []);
    setUnread(res.data.unread || 0);
  }

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);

  async function openItem(item) {
    try {
      if (!item.read) await api(`/notifications/${item._id}/read`, { method: 'PATCH' });
    } catch {
      // ignore
    }
    setOpen(false);
    await load().catch(() => {});
    if (item.link) navigate(item.link);
  }

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' });
    await load();
  }

  return (
    <div className="notify-wrap">
      <button type="button" className="shell-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        Notifications
        {unread > 0 ? <span className="notify-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="notify-panel">
          <div className="notify-head">
            <strong>Notifications</strong>
            {unread > 0 ? (
              <button type="button" className="btn ghost" style={{ padding: '0.3rem 0.6rem' }} onClick={markAll}>
                Mark all read
              </button>
            ) : null}
          </div>
          {items.map((item) => (
            <button
              key={item._id}
              type="button"
              className={`notify-item ${item.read ? '' : 'unread'}`}
              onClick={() => openItem(item)}
            >
              <strong>{item.title}</strong>
              <span>{item.message}</span>
              <em>{new Date(item.createdAt).toLocaleString()}</em>
            </button>
          ))}
          {!items.length ? <div className="empty">No notifications yet</div> : null}
        </div>
      ) : null}
    </div>
  );
}

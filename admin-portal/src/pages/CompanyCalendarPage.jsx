import { useEffect, useState } from 'react';
import { api } from '../api/client';

const TYPE_LABEL = {
  holiday: 'Holiday',
  leave: 'Leave',
  joining: 'Joining',
  anniversary: 'Anniversary',
};

export default function CompanyCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load(nextYear = year, nextMonth = month) {
    const res = await api(`/org/calendar?year=${nextYear}&month=${nextMonth}`);
    setData(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function shift(delta) {
    const date = new Date(year, month - 1 + delta, 1);
    const nextYear = date.getFullYear();
    const nextMonth = date.getMonth() + 1;
    setYear(nextYear);
    setMonth(nextMonth);
    load(nextYear, nextMonth).catch((err) => setError(err.message));
  }

  const label = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const grouped = new Map();
  for (const event of data?.events || []) {
    const key = new Date(event.date).toDateString();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Company calendar</h1>
          <p>Leaves, holidays, joining dates, and work anniversaries</p>
        </div>
        <div className="row-actions">
          <button className="btn ghost" type="button" onClick={() => shift(-1)}>Previous</button>
          <strong>{label}</strong>
          <button className="btn ghost" type="button" onClick={() => shift(1)}>Next</button>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="cal-event-list">
        {[...grouped.entries()].map(([day, events]) => (
          <div className="panel" key={day} style={{ marginBottom: '0.75rem' }}>
            <h3>{day}</h3>
            {events.map((event, index) => (
              <div className={`cal-event ${event.type}`} key={`${event.title}-${index}`}>
                <span className="badge">{TYPE_LABEL[event.type] || event.type}</span>
                <div>
                  <strong>{event.title}</strong>
                  {event.subtitle ? <div className="muted">{event.subtitle}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ))}
        {!(data?.events || []).length ? <div className="panel empty">No events this month</div> : null}
      </div>
    </div>
  );
}

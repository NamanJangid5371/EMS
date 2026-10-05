import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AttendanceCalendar from './AttendanceCalendar';

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function DashboardAttendanceCalendar() {
  const { user } = useAuth();
  const employeeId = user?.profile?._id || user?.employeeProfile || null;
  const [{ year, month }, setCursor] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load(nextYear = year, nextMonth = month) {
    if (!employeeId) return;
    const params = new URLSearchParams({
      year: String(nextYear),
      month: String(nextMonth),
      employeeId: String(employeeId),
    });
    const res = await api(`/attendance/calendar?${params.toString()}`);
    setData(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [employeeId]);

  function shiftMonth(delta) {
    const next = new Date(year, month - 1 + delta, 1);
    const nextYear = next.getFullYear();
    const nextMonth = next.getMonth() + 1;
    setCursor({ year: nextYear, month: nextMonth });
    load(nextYear, nextMonth).catch((err) => setError(err.message));
  }

  if (!employeeId) {
    return <div className="muted">No profile linked for calendar</div>;
  }

  return (
    <div className="cal-compact">
      {error ? <div className="error" style={{ marginBottom: '0.4rem' }}>{error}</div> : null}
      <AttendanceCalendar
        data={data}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
      />
    </div>
  );
}

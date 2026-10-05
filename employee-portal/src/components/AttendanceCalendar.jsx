function weekdayLabels() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

function monthTitle(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayClass(kind) {
  if (kind === 'leave') return 'cal-day leave';
  if (kind === 'attended') return 'cal-day attended';
  if (kind === 'holiday') return 'cal-day holiday';
  if (kind === 'absent') return 'cal-day absent';
  return 'cal-day';
}

function dayTitle(day) {
  if (day.kind === 'holiday') return day.holidayName || 'Holiday';
  if (day.kind === 'attended') return 'Present';
  if (day.kind === 'leave') return 'Leave';
  if (day.kind === 'absent') return 'Absent';
  return '';
}

export default function AttendanceCalendar({ data, onPrev, onNext }) {
  if (!data) return <div className="muted">Loading calendar…</div>;

  const firstWeekday = new Date(data.year, data.month - 1, 1).getDay();
  const blanks = Array.from({ length: firstWeekday });

  return (
    <div>
      <div className="cal-toolbar">
        <div className="row-actions">
          <button className="btn ghost" type="button" onClick={onPrev}>Prev</button>
          <strong>{monthTitle(data.year, data.month)}</strong>
          <button className="btn ghost" type="button" onClick={onNext}>Next</button>
        </div>
      </div>
      <div className="cal-legend">
        <span><i className="cal-dot attended" /> Attended</span>
        <span><i className="cal-dot leave" /> Leave</span>
        <span><i className="cal-dot holiday" /> Holiday</span>
        <span><i className="cal-dot absent" /> Absent</span>
      </div>
      <div className="cal-grid">
        {weekdayLabels().map((label) => (
          <div key={label} className="cal-weekday">{label}</div>
        ))}
        {blanks.map((_, idx) => <div key={`b-${idx}`} className="cal-day empty" />)}
        {(data.days || []).map((day) => (
          <div key={day.day} className={dayClass(day.kind)} title={dayTitle(day)}>
            <strong>{day.day}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

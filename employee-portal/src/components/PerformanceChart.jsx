const FACTORS = [
  { key: 'taskCompletion', label: 'Task completion vs deadline', short: 'Tasks' },
  { key: 'monthlyAttendance', label: 'Monthly attendance', short: 'Attendance' },
  { key: 'workQuality', label: 'Work quality', short: 'Quality' },
  { key: 'aptitude', label: 'Aptitude', short: 'Aptitude' },
];

const SLICE_COLORS = ['#0f6b4c', '#1f7a8c', '#c45c26', '#b54708'];

function toScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null;
}

function scoreBand(score) {
  if (score == null) return 'Not rated';
  if (score >= 8) return 'Strong';
  if (score >= 6) return 'Good';
  if (score >= 4) return 'Watch';
  return 'Needs action';
}

function bandClass(score) {
  if (score == null) return '';
  if (score >= 8) return 'strong';
  if (score >= 6) return 'good';
  if (score >= 4) return 'watch';
  return 'action';
}

function polar(cx, cy, r, angle) {
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

function PieChart({ scores }) {
  const size = 210;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 78;
  const slices = scores.map((item, index) => ({
    ...item,
    value: item.score ?? 0,
    color: SLICE_COLORS[index % SLICE_COLORS.length],
  }));
  const total = slices.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="perf-pie" role="img" aria-label="Performance pie chart">
        <circle cx={cx} cy={cy} r={radius} fill="#eef4f0" stroke="#d5e0d9" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="perf-pie-empty">
          No ratings
        </text>
      </svg>
    );
  }

  let angle = -Math.PI / 2;
  const paths = slices.map((item) => {
    const sweep = (item.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const large = sweep > Math.PI ? 1 : 0;
    const [x1, y1] = polar(cx, cy, radius, start);
    const [x2, y2] = polar(cx, cy, radius, end);
    return {
      ...item,
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="perf-pie" role="img" aria-label="Performance pie chart">
      {paths.map((item) => (
        <path key={item.key} d={item.d} fill={item.color} stroke="#fff" strokeWidth="2">
          <title>{`${item.short}: ${item.score ?? 0}/10`}</title>
        </path>
      ))}
    </svg>
  );
}

export default function PerformanceChart({ performance, updatedAt }) {
  const scores = FACTORS.map((factor) => ({
    ...factor,
    score: toScore(performance?.[factor.key]),
  }));
  const rated = scores.filter((item) => item.score != null);
  const average = rated.length
    ? Math.round((rated.reduce((sum, item) => sum + item.score, 0) / rated.length) * 10) / 10
    : null;
  const weakest = rated.slice().sort((a, b) => a.score - b.score)[0];
  const strongest = rated.slice().sort((a, b) => b.score - a.score)[0];

  let insight = 'No ratings yet. Your manager can score these factors to support reviews and decisions.';
  if (average != null && weakest && strongest) {
    if (weakest.score < 6) {
      insight = `Priority: improve ${weakest.label.toLowerCase()} (${weakest.score}/10).`;
    } else if (average >= 8) {
      insight = `Strong overall (${average}/10). ${strongest.short} is the standout factor.`;
    } else {
      insight = `Solid overall (${average}/10). Next focus: ${weakest.label.toLowerCase()}.`;
    }
  }

  return (
    <div className="perf-visual">
      <div className="perf-visual-top">
        <PieChart scores={scores} />
        <div className="perf-overall">
          <div className="perf-overall-score">{average ?? '—'}</div>
          <div className="muted">Overall / 10</div>
          <span className={`perf-band ${bandClass(average)}`}>{scoreBand(average)}</span>
          {updatedAt ? (
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.45rem' }}>
              Updated {new Date(updatedAt).toLocaleDateString()}
            </div>
          ) : null}
        </div>
      </div>

      <ul className="perf-pie-legend">
        {scores.map((item, index) => (
          <li key={item.key}>
            <span className="swatch" style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }} />
            <span>{item.label}</span>
            <strong>{item.score ?? '—'}</strong>
          </li>
        ))}
      </ul>

      <p className="perf-insight">{insight}</p>
      {performance?.remarks ? (
        <p className="muted" style={{ fontSize: '0.88rem' }}>Remarks: {performance.remarks}</p>
      ) : null}
    </div>
  );
}

const PALETTE = ['#0f6b4c', '#c45c26', '#1f7a8c', '#b54708', '#5c6f64', '#0a4d38', '#8b5e34'];

const ATTENDANCE_COLORS = {
  present: '#0f6b4c',
  'full day': '#0f6b4c',
  late: '#c45c26',
  'half day': '#1f7a8c',
  half_day: '#1f7a8c',
  'on leave': '#b54708',
  on_leave: '#b54708',
  absent: '#5c6f64',
};

function normalize(items = []) {
  return items
    .map((item) => ({
      label: String(item.label || '—'),
      value: Number(item.value) || 0,
      key: item.key || item.label,
    }))
    .filter((item) => item.value >= 0);
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BarChart({ title, items, emptyText = 'No data yet' }) {
  const data = normalize(items);
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="panel chart-card">
      <h3>{title}</h3>
      {!data.length ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="bar-chart" role="img" aria-label={title}>
          {data.map((item, index) => {
            const height = Math.max(8, Math.round((item.value / max) * 140));
            return (
              <div className="bar-col" key={`${item.label}-${index}`}>
                <div className="bar-value">{item.value}</div>
                <div
                  className="bar"
                  style={{
                    height: `${height}px`,
                    background: PALETTE[index % PALETTE.length],
                  }}
                  title={`${item.label}: ${item.value}`}
                />
                <div className="bar-label">{item.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DonutChart({ title, items, emptyText = 'No data yet', showZeros = false }) {
  const normalized = normalize(items);
  const data = showZeros ? normalized : normalized.filter((d) => d.value > 0);
  const visible = data.filter((d) => d.value > 0);
  const total = visible.reduce((sum, d) => sum + d.value, 0) || 1;
  const size = 160;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="panel chart-card">
      <h3>{title}</h3>
      {!visible.length ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="donut-wrap">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e4efe9"
              strokeWidth={stroke}
            />
            {visible.map((item, index) => {
              const length = (item.value / total) * circumference;
              const circle = (
                <circle
                  key={`${item.label}-${index}`}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={PALETTE[index % PALETTE.length]}
                  strokeWidth={stroke}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              offset += length;
              return circle;
            })}
            <text
              x="50%"
              y="48%"
              textAnchor="middle"
              className="donut-total"
              fill="#0a4d38"
              fontSize="22"
              fontFamily="Fraunces, Georgia, serif"
              fontWeight="700"
            >
              {total}
            </text>
            <text
              x="50%"
              y="62%"
              textAnchor="middle"
              fill="#5c6f64"
              fontSize="11"
            >
              total
            </text>
          </svg>
          <ul className="chart-legend">
            {data.map((item, index) => {
              const colorIndex = visible.findIndex((v) => v.label === item.label);
              const color = PALETTE[(colorIndex >= 0 ? colorIndex : index) % PALETTE.length];
              const pct = total ? Math.round((item.value / total) * 100) : 0;
              return (
                <li key={`${item.label}-${index}`}>
                  <span className="swatch" style={{ background: color }} />
                  <span>{titleCase(item.label)}</span>
                  <strong>
                    {item.value}
                    <span className="legend-pct"> ({pct}%)</span>
                  </strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AttendanceCircleChart({
  title,
  items,
  meta = {},
  emptyText = 'No data yet',
}) {
  const data = normalize(items);
  const visible = data.filter((d) => d.value > 0);
  const totalMarked = data.reduce((sum, d) => sum + d.value, 0);
  const hasAny = totalMarked > 0;
  const presentRate = meta.presentRate ?? 0;
  const workforce = meta.workforce ?? 0;
  const size = 200;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="panel chart-card">
      <h3>{title}</h3>
      {!hasAny ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <>
          <div className="attendance-meta">
            <div>
              <span className="meta-label">Present rate</span>
              <strong>{presentRate}%</strong>
            </div>
            <div>
              <span className="meta-label">Marked today</span>
              <strong>
                {totalMarked}/{workforce || '—'}
              </strong>
            </div>
            <div>
              <span className="meta-label">Still logged in</span>
              <strong>{meta.stillLoggedIn ?? 0}</strong>
            </div>
            <div>
              <span className="meta-label">Logged out</span>
              <strong>{meta.loggedOut ?? 0}</strong>
            </div>
          </div>

          <div className="attendance-circle-wrap">
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              role="img"
              aria-label={title}
              className="attendance-circle-svg"
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#e7efe9"
                strokeWidth={stroke}
              />
              {visible.map((item, index) => {
                const length = (item.value / totalMarked) * circumference;
                const color =
                  ATTENDANCE_COLORS[item.key] ||
                  ATTENDANCE_COLORS[item.label] ||
                  PALETTE[index % PALETTE.length];
                const circle = (
                  <circle
                    key={`${item.label}-${index}`}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    className="attendance-segment"
                  />
                );
                offset += length;
                return circle;
              })}
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                fill="#0a4d38"
                fontSize="28"
                fontFamily="Fraunces, Georgia, serif"
                fontWeight="700"
              >
                {presentRate}%
              </text>
              <text
                x="50%"
                y="58%"
                textAnchor="middle"
                fill="#5c6f64"
                fontSize="12"
              >
                present
              </text>
              <text
                x="50%"
                y="70%"
                textAnchor="middle"
                fill="#5c6f64"
                fontSize="11"
              >
                {totalMarked} marked
              </text>
            </svg>

            <ul className="chart-legend">
              {data.map((item, index) => {
                const color =
                  ATTENDANCE_COLORS[item.key] ||
                  ATTENDANCE_COLORS[item.label] ||
                  PALETTE[index % PALETTE.length];
                const pct = totalMarked ? Math.round((item.value / totalMarked) * 100) : 0;
                return (
                  <li key={`${item.label}-${index}`} className={item.value === 0 ? 'is-zero' : undefined}>
                    <span className="swatch" style={{ background: color }} />
                    <span>{titleCase(item.label)}</span>
                    <strong>
                      {item.value}
                      <span className="legend-pct"> · {pct}%</span>
                    </strong>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

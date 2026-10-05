import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';

const RANGE_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_30_days', label: 'Last 30 Days' },
];

const REPORT_TABS = [
  ['employee', 'Employee'],
  ['attendance', 'Attendance'],
  ['leave', 'Leave'],
  ['working_hours', 'Working Hours'],
  ['department', 'Department'],
  ['manager', 'Manager'],
  ['activity', 'Activity'],
  ['performance', 'Performance'],
];

function buildParams(range, departmentId) {
  const params = new URLSearchParams({ range });
  if (departmentId) params.set('departmentId', departmentId);
  return params.toString();
}

function exportExcel(report, tab) {
  const deptRows = report.departmentReport?.rows || report.departmentReport || [];
  const rows = [
    ['Report tab', tab],
    ['Present', `${report.overview?.present ?? 0}%`],
    ['Absent', `${report.overview?.absent ?? 0}%`],
    ['On Leave', `${report.overview?.onLeave ?? 0}%`],
    ['Late', `${report.overview?.late ?? 0}%`],
    [],
    ['Department report'],
    ['Department', 'People', 'Managers', 'Share %', 'Attendance %', 'Present days', 'Late days', 'Half day', 'Leave days', 'Absent days', 'Hours', 'Overtime', 'Avg hours', 'Pending leave', 'Approved leave days'],
    ...deptRows.map((row) => [
      row.label,
      row.employees,
      row.managers,
      row.sharePercent,
      row.attendancePercent,
      row.presentDays,
      row.lateDays,
      row.halfDayDays,
      row.leaveDays,
      row.absentDays,
      row.hours,
      row.overtime,
      row.avgHours,
      row.pendingLeaves,
      row.approvedLeaveDays,
    ]),
    [],
    ['Department Attendance'],
    ['Department', 'Percent'],
    ...(report.departmentAttendance || []).map((row) => [row.label, `${row.percent}%`]),
    [],
    ['Top Attendance Issues'],
    ['Employee', 'Late Days', 'Absent Days'],
    ...(report.topAttendanceIssues || []).map((row) => [row.name, row.lateDays, row.absentDays]),
    [],
    ['Leave by status'],
    ...(report.leaveReport?.byStatus || []).map((row) => [row.label, row.value]),
    [],
    ['Working hours'],
    ['Employee', 'Hours', 'Overtime', 'Avg'],
    ...(report.workingHoursReport?.rows || []).map((row) => [row.name, row.hours, row.overtime, row.avg]),
  ];
  const csv = rows.map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tab}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState('this_month');
  const [departmentId, setDepartmentId] = useState('');
  const [activeTab, setActiveTab] = useState('attendance');

  async function load(nextRange = range, nextDepartment = departmentId) {
    const res = await api(`/dashboard/reports?${buildParams(nextRange, nextDepartment)}`);
    setData(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const departments = data?.departments || [];
  const overview = data?.overview || {};
  const topIssues = data?.topAttendanceIssues || [];
  const deptRows = data?.departmentAttendance || [];
  const employeeReport = data?.employeeReport || {};
  const leaveReport = data?.leaveReport || {};
  const hoursReport = data?.workingHoursReport || {};
  const departmentReport = data?.departmentReport?.rows || data?.departmentReport || [];
  const departmentSummary = data?.departmentReport?.summary || {};
  const managerReport = data?.managerReport || [];
  const activityReport = data?.activityReport || [];
  const performanceReport = data?.performanceReport || [];

  const summaryCards = useMemo(
    () => [
      ['Present', `${overview.present ?? 0}%`],
      ['Absent', `${overview.absent ?? 0}%`],
      ['On Leave', `${overview.onLeave ?? 0}%`],
      ['Late', `${overview.late ?? 0}%`],
    ],
    [overview]
  );

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Reports</h1>
          <p>People, attendance, leave, hours, departments, teams, and activity</p>
        </div>
      </div>
      {error ? <div className="error" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      <div className="panel report-shell">
        <div className="filter-bar">
          <div className="filter-bar-head">
            <div>
              <strong>Report filters</strong>
              <p className="muted">Choose a period and department — results update immediately</p>
            </div>
          </div>
          <div className="filter-bar-grid even">
            <div className="field">
              <label>Date range</label>
              <SearchableSelect
                value={range}
                onChange={(e) => {
                  const next = e.target.value;
                  setRange(next);
                  load(next, departmentId).catch((err) => setError(err.message));
                }}
                options={RANGE_OPTIONS}
              />
            </div>
            <div className="field">
              <label>Department</label>
              <SearchableSelect
                value={departmentId}
                onChange={(e) => {
                  const next = e.target.value;
                  setDepartmentId(next);
                  load(range, next).catch((err) => setError(err.message));
                }}
                options={[
                  { value: '', label: 'All departments' },
                  ...departments.map((dept) => ({ value: dept._id, label: dept.name })),
                ]}
              />
            </div>
          </div>
        </div>

        <div className="report-tabs">
          {REPORT_TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`report-tab ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {!data ? (
          <div className="panel" style={{ marginTop: '1rem' }}>
            <div className="empty">Loading report…</div>
          </div>
        ) : activeTab === 'employee' ? (
          <>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Employee overview</h3>
              <div className="grid stats" style={{ marginTop: '1rem' }}>
                {[['Workforce', employeeReport.total], ['Employees', employeeReport.employees], ['Managers', employeeReport.managers], ['Incomplete', employeeReport.incomplete]].map(([label, value]) => (
                  <div className="stat" key={label}><div className="label">{label}</div><div className="value">{value ?? 0}</div></div>
                ))}
              </div>
            </div>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Directory snapshot</h3>
              <div className="report-progress-list" style={{ marginTop: '1rem' }}>
                {(employeeReport.rows || []).map((row) => (
                  <div key={row.employeeId} className="report-progress-row">
                    <div className="report-progress-label">{row.name}<div className="muted">{row.code} · {row.department}</div></div>
                    <strong>{row.role}</strong>
                  </div>
                ))}
                {!(employeeReport.rows || []).length ? <div className="empty">No employees in this filter</div> : null}
              </div>
            </div>
          </>
        ) : activeTab === 'leave' ? (
          <>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Leave overview</h3>
              <div className="grid stats" style={{ marginTop: '1rem' }}>
                {[['Requests', leaveReport.total], ['Pending', leaveReport.pending], ['Approved days', leaveReport.approvedDays]].map(([label, value]) => (
                  <div className="stat" key={label}><div className="label">{label}</div><div className="value">{value ?? 0}</div></div>
                ))}
              </div>
            </div>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>By status</h3>
              <div className="report-progress-list" style={{ marginTop: '1rem' }}>
                {(leaveReport.byStatus || []).map((row) => (
                  <div key={row.label} className="report-progress-row">
                    <div className="report-progress-label">{row.label}</div>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Approved days by type</h3>
              <div className="report-progress-list" style={{ marginTop: '1rem' }}>
                {(leaveReport.byType || []).map((row) => (
                  <div key={row.label} className="report-progress-row">
                    <div className="report-progress-label">{row.label}</div>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : activeTab === 'working_hours' ? (
          <>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Working hours</h3>
              <div className="grid stats" style={{ marginTop: '1rem' }}>
                {[['Total hours', hoursReport.totalHours], ['Overtime', hoursReport.overtimeHours], ['Avg / day', hoursReport.avgHours], ['Low-hour people', hoursReport.lowHours]].map(([label, value]) => (
                  <div className="stat" key={label}><div className="label">{label}</div><div className="value">{value ?? 0}</div></div>
                ))}
              </div>
            </div>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Hours by employee</h3>
              <div className="report-progress-list" style={{ marginTop: '1rem' }}>
                {(hoursReport.rows || []).map((row) => (
                  <div key={row.employeeId} className="report-progress-row">
                    <div className="report-progress-label">{row.name}<div className="muted">{row.code}</div></div>
                    <div className="report-progress-bar"><div className="report-progress-fill" style={{ width: `${Math.min(100, (row.avg / 9) * 100)}%` }} /></div>
                    <strong>{row.hours}h</strong>
                  </div>
                ))}
                {!(hoursReport.rows || []).length ? <div className="empty">No completed workdays in this range</div> : null}
              </div>
            </div>
          </>
        ) : activeTab === 'department' ? (
          <>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Department overview</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                Headcount, attendance mix, hours, and leave for the selected period. Attendance % is present + late + half day vs working days (weekends and holidays excluded).
              </p>
              <div className="grid stats" style={{ marginTop: '1rem' }}>
                {[
                  ['Departments', departmentSummary.departments ?? departmentReport.length],
                  ['People', departmentSummary.people ?? '—'],
                  ['Largest', departmentSummary.largest || '—'],
                  ['Lowest attendance', departmentSummary.lowestAttendance
                    ? `${departmentSummary.lowestAttendance} (${departmentSummary.lowestAttendancePercent}%)`
                    : '—'],
                  ['Unassigned', departmentSummary.unassigned ?? 0],
                ].map(([label, value]) => (
                  <div className="stat" key={label}>
                    <div className="label">{label}</div>
                    <div className="value" style={String(label).length > 10 || String(value).length > 8 ? { fontSize: '1.15rem' } : undefined}>{value ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Compare departments</h3>
              <div className="table-wrap" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>People</th>
                      <th>Share</th>
                      <th>Attendance</th>
                      <th>Absent days</th>
                      <th>Leave days</th>
                      <th>Hours</th>
                      <th>OT</th>
                      <th>Pending leave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentReport.map((row) => (
                      <tr key={row.id || row.label}>
                        <td>
                          <strong>{row.label}</strong>
                          <div className="muted" style={{ fontSize: '0.82rem' }}>
                            {row.staff ?? Math.max(0, (row.employees || 0) - (row.managers || 0))} staff · {row.managers || 0} manager(s)
                          </div>
                        </td>
                        <td>{row.employees}</td>
                        <td>{row.sharePercent ?? 0}%</td>
                        <td>{row.attendancePercent}%</td>
                        <td>{row.absentDays ?? 0}</td>
                        <td>{row.leaveDays ?? 0}</td>
                        <td>{row.hours ?? 0}h</td>
                        <td>{row.overtime ?? 0}h</td>
                        <td>{row.pendingLeaves ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!departmentReport.length ? <div className="empty">No department data</div> : null}
              </div>
            </div>

            {departmentReport.map((row) => (
              <div key={row.id || row.label} className="panel report-section dept-report-card" style={{ marginTop: '1rem' }}>
                <div className="dept-report-head">
                  <div>
                    <h3>{row.label}</h3>
                    <p className="muted">
                      {row.employees} people · {row.sharePercent ?? 0}% of workforce
                      {row.incomplete ? ` · ${row.incomplete} incomplete profile(s)` : ''}
                    </p>
                  </div>
                  <span className={`badge ${row.attendancePercent >= 80 ? 'present' : row.attendancePercent >= 60 ? 'on_leave' : 'absent'}`}>
                    {row.attendancePercent}% attendance
                  </span>
                </div>
                <div className="dept-mix" aria-label={`${row.label} attendance mix`}>
                  <div className="dept-mix-bar">
                    <span style={{ width: `${row.presentPercent || 0}%` }} className="mix-present" title={`Full day ${row.presentPercent || 0}%`} />
                    <span style={{ width: `${row.latePercent || 0}%` }} className="mix-late" title={`Late ${row.latePercent || 0}%`} />
                    <span style={{ width: `${row.halfDayPercent || 0}%` }} className="mix-half" title={`Half day ${row.halfDayPercent || 0}%`} />
                    <span style={{ width: `${row.leavePercent || 0}%` }} className="mix-leave" title={`On leave ${row.leavePercent || 0}%`} />
                    <span style={{ width: `${row.absentPercent || 0}%` }} className="mix-absent" title={`Absent ${row.absentPercent || 0}%`} />
                  </div>
                  <div className="dept-mix-legend">
                    <span>Full day {row.presentDays || 0}</span>
                    <span>Late {row.lateDays || 0}</span>
                    <span>Half day {row.halfDayDays || 0}</span>
                    <span>Leave {row.leaveDays || 0}</span>
                    <span>Absent {row.absentDays || 0}</span>
                  </div>
                </div>
                <div className="grid stats" style={{ marginTop: '1rem' }}>
                  {[
                    ['Avg hours', `${row.avgHours ?? 0}h`],
                    ['Work hours', `${row.hours ?? 0}h`],
                    ['Overtime', `${row.overtime ?? 0}h`],
                    ['Approved leave', `${row.approvedLeaveDays ?? 0}d`],
                    ['Pending leave', row.pendingLeaves ?? 0],
                  ].map(([label, value]) => (
                    <div className="stat" key={label}>
                      <div className="label">{label}</div>
                      <div className="value" style={{ fontSize: '1.25rem' }}>{value}</div>
                    </div>
                  ))}
                </div>
                {row.designations?.length ? (
                  <div className="dept-tags">
                    {row.designations.map((title) => (
                      <span key={title} className="badge">{title}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </>
        ) : activeTab === 'manager' ? (
          <div className="panel report-section" style={{ marginTop: '1rem' }}>
            <h3>Manager / team report</h3>
            <div className="report-progress-list" style={{ marginTop: '1rem' }}>
              {managerReport.map((row) => (
                <div key={row.employeeId} className="report-progress-row">
                  <div className="report-progress-label">{row.name}<div className="muted">{row.department}</div></div>
                  <strong>{row.teamSize} reports</strong>
                </div>
              ))}
              {!managerReport.length ? <div className="empty">No managers in this filter</div> : null}
            </div>
          </div>
        ) : activeTab === 'activity' ? (
          <div className="panel report-section" style={{ marginTop: '1rem' }}>
            <h3>Activity</h3>
            <div className="report-progress-list" style={{ marginTop: '1rem' }}>
              {activityReport.map((row, index) => (
                <div key={`${row.timestamp}-${index}`} className="report-progress-row">
                  <div className="report-progress-label">{String(row.action || '').replace(/_/g, ' ')}<div className="muted">{row.actor} · {row.role}</div></div>
                  <strong>{row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}</strong>
                </div>
              ))}
              {!activityReport.length ? <div className="empty">No audited activity in this range</div> : null}
            </div>
          </div>
        ) : activeTab === 'performance' ? (
          <div className="panel report-section" style={{ marginTop: '1rem' }}>
            <h3>Performance</h3>
            <div className="report-progress-list" style={{ marginTop: '1rem' }}>
              {performanceReport.map((row) => (
                <div key={row.employeeId} className="report-progress-row">
                  <div className="report-progress-label">{row.name}<div className="muted">{row.department}</div></div>
                  <div className="report-progress-bar"><div className="report-progress-fill" style={{ width: `${(row.average / 10) * 100}%` }} /></div>
                  <strong>{row.average}/10</strong>
                </div>
              ))}
              {!performanceReport.length ? <div className="empty">No scored performance records</div> : null}
            </div>
          </div>
        ) : (
          <>
            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Attendance Overview</h3>
              <div className="grid stats" style={{ marginTop: '1rem' }}>
                {summaryCards.map(([label, value]) => (
                  <div className="stat" key={label}>
                    <div className="label">{label}</div>
                    <div className="value">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Department Attendance</h3>
              <div className="report-progress-list" style={{ marginTop: '1rem' }}>
                {deptRows.map((row) => (
                  <div key={row.label} className="report-progress-row">
                    <div className="report-progress-label">{row.label}</div>
                    <div className="report-progress-bar">
                      <div className="report-progress-fill" style={{ width: `${row.percent}%` }} />
                    </div>
                    <strong>{row.percent}%</strong>
                  </div>
                ))}
                {!deptRows.length ? <div className="empty">No department attendance data</div> : null}
              </div>
            </div>

            <div className="panel report-section" style={{ marginTop: '1rem' }}>
              <h3>Top Attendance Issues</h3>
              <div className="table-wrap" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Late Days</th>
                      <th>Absent Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topIssues.map((row) => (
                      <tr key={`${row.employeeId}-${row.code}`}>
                        <td>
                          <div>{row.name}</div>
                          <div className="muted" style={{ fontSize: '0.82rem' }}>{row.code}</div>
                        </td>
                        <td>{row.lateDays}</td>
                        <td>{row.absentDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!topIssues.length ? <div className="empty">No attendance issues in this range</div> : null}
              </div>
            </div>
          </>
        )}

        <div className="row-actions" style={{ marginTop: '1rem' }}>
          <button className="btn secondary" type="button" onClick={() => exportExcel(data || {}, activeTab)}>
            Export Excel
          </button>
          <button className="btn ghost" type="button" onClick={() => window.print()}>
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}

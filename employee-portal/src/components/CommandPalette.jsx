import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

function ResultGroup({ title, items, onPick }) {
  if (!items.length) return null;
  return (
    <div className="palette-group">
      <div className="palette-group-title">{title}</div>
      {items.map((item) => (
        <button key={item.key} type="button" className="palette-item" onClick={() => onPick(item.href)}>
          <strong>{item.label}</strong>
          {item.meta ? <span>{item.meta}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default function CommandPalette({
  open,
  onClose,
  actions = [],
  employeeHref = () => '/profile',
  departmentHref = () => '/profile',
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(q)}`)
        .then((res) => setResults(res.data))
        .catch((err) => setError(err.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((action) => action.label.toLowerCase().includes(q) || action.hint?.toLowerCase().includes(q));
  }, [actions, query]);

  if (!open) return null;

  function go(href) {
    onClose();
    navigate(href);
  }

  const employees = (results?.employees || []).map((row) => ({
    key: `e-${row._id}`,
    label: row.name,
    meta: `${row.employeeId || ''} · ${row.designation || row.departmentId?.name || 'Employee'}`,
    href: employeeHref(row._id),
  }));
  const leaves = (results?.leaves || []).map((row) => ({
    key: `l-${row._id}`,
    label: `${row.type} leave`,
    meta: row.status,
    href: '/leaves',
  }));
  const attendance = (results?.attendance || []).map((row) => ({
    key: `a-${row._id}`,
    label: String(row.status || '').replace(/_/g, ' '),
    meta: row.date ? new Date(row.date).toLocaleDateString() : '',
    href: '/attendance',
  }));

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div className="palette-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <input
          autoFocus
          className="palette-input"
          placeholder="Search your records or jump to a page"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        {error ? <div className="error" style={{ margin: '0.5rem 0 0' }}>{error}</div> : null}
        <div className="palette-body">
          <ResultGroup title="Quick actions" items={filteredActions.map((action) => ({
            key: action.href,
            label: action.label,
            meta: action.hint,
            href: action.href,
          }))} onPick={go} />
          <ResultGroup title="People" items={employees} onPick={go} />
          <ResultGroup title="Leaves" items={leaves} onPick={go} />
          <ResultGroup title="Attendance" items={attendance} onPick={go} />
        </div>
        <div className="palette-hint">Ctrl+K to open · Esc to close</div>
      </div>
    </div>
  );
}

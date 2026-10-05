import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  disabled = false,
  required = false,
  placeholder = 'Select',
  searchPlaceholder = 'Search…',
  name,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  const selected = options.find((opt) => String(opt.value) === String(value ?? ''));
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((opt) => String(opt.label || '').toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    function onDoc(event) {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function pick(next) {
    onChange?.({ target: { value: next, name: name || '' } });
    setOpen(false);
    setQuery('');
  }

  return (
    <div
      className={`search-select ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
      ref={wrapRef}
    >
      <input type="hidden" name={name} value={value ?? ''} required={required} />
      <button
        type="button"
        className="search-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          setQuery('');
        }}
      >
        <span className={selected ? '' : 'placeholder'}>{selected?.label || placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="search-select-menu">
          <input
            ref={searchRef}
            type="search"
            className="search-select-input"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                setQuery('');
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (filtered[0]) pick(String(filtered[0].value));
              }
            }}
          />
          <div className="search-select-list" role="listbox">
            {filtered.map((opt) => (
              <button
                key={`${opt.value}-${opt.label}`}
                type="button"
                role="option"
                aria-selected={String(opt.value) === String(value ?? '')}
                className={`search-select-option ${String(opt.value) === String(value ?? '') ? 'active' : ''}`}
                onClick={() => pick(String(opt.value))}
              >
                {opt.label}
              </button>
            ))}
            {!filtered.length ? <div className="search-select-empty">No matches</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

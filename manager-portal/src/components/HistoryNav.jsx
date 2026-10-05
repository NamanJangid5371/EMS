import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconForward() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HistoryNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const indexRef = useRef(0);
  const stackRef = useRef([]);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  useEffect(() => {
    const path = `${location.pathname}${location.search}${location.hash}`;

    if (stackRef.current.length === 0) {
      stackRef.current = [path];
      indexRef.current = 0;
    } else if (navType === 'POP') {
      const idx = stackRef.current.indexOf(path);
      if (idx >= 0) indexRef.current = idx;
    } else if (navType === 'PUSH') {
      stackRef.current = stackRef.current.slice(0, indexRef.current + 1);
      stackRef.current.push(path);
      indexRef.current = stackRef.current.length - 1;
    } else if (navType === 'REPLACE') {
      stackRef.current[indexRef.current] = path;
    }

    setCanBack(indexRef.current > 0);
    setCanForward(indexRef.current < stackRef.current.length - 1);
  }, [location, navType]);

  return (
    <nav className="shell-history-nav" aria-label="Page history">
      <button
        type="button"
        className="shell-history-btn"
        aria-label="Back"
        title="Back"
        disabled={!canBack}
        onClick={() => navigate(-1)}
      >
        <IconBack />
      </button>
      <button
        type="button"
        className="shell-history-btn"
        aria-label="Forward"
        title="Forward"
        disabled={!canForward}
        onClick={() => navigate(1)}
      >
        <IconForward />
      </button>
    </nav>
  );
}

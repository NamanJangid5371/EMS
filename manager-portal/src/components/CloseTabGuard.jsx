import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const MESSAGE = 'Please logout before closing the tab';

export function allowTabClose() {
  sessionStorage.setItem('ems_allow_tab_close', '1');
}

function isReloadShortcut(event) {
  if (event.key === 'F5') return true;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') return true;
  return false;
}

export default function CloseTabGuard() {
  const { user } = useAuth();
  const [shiftOpen, setShiftOpen] = useState(false);
  const skipRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setShiftOpen(false);
      return undefined;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const res = await api('/dashboard');
        const today = res.data?.stats?.todayAttendance || res.data?.myAttendance;
        if (!cancelled) {
          setShiftOpen(Boolean(today?.checkIn && !today?.checkOut));
        }
      } catch {
        if (!cancelled) setShiftOpen(true);
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [user]);

  useEffect(() => {
    function onKeyDown(event) {
      if (isReloadShortcut(event)) {
        skipRef.current = true;
      }
    }

    function onNavigate(event) {
      if (event.navigationType === 'reload') {
        skipRef.current = true;
      }
    }

    function onBeforeUnload(event) {
      const allowed = skipRef.current || sessionStorage.getItem('ems_allow_tab_close') === '1';
      if (allowed || !user || !shiftOpen) return;
      event.preventDefault();
      event.returnValue = MESSAGE;
      return MESSAGE;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', onBeforeUnload);
    if (window.navigation?.addEventListener) {
      window.navigation.addEventListener('navigate', onNavigate);
    }
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (window.navigation?.removeEventListener) {
        window.navigation.removeEventListener('navigate', onNavigate);
      }
    };
  }, [user, shiftOpen]);

  return null;
}

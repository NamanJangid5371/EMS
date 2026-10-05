import { createContext, useContext, useMemo, useState } from 'react';
import { api, clearAuth, getStoredUser, getToken, setAuth } from '../api/client';

const AuthContext = createContext(null);
const expectedRole = import.meta.env.VITE_PORTAL_ROLE;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false);

  const value = useMemo(
    () => ({
      user,
      loading,
      async login(email, password) {
        setLoading(true);
        try {
          const res = await api('/auth/login', {
            method: 'POST',
            body: { email, password },
          });
          if (res.data.user.role !== expectedRole) {
            throw new Error(`This portal is for ${expectedRole} accounts only.`);
          }
          sessionStorage.removeItem('ems_allow_tab_close');
          setAuth(res.data.token, res.data.user);
          setUser(res.data.user);
          return res.data.user;
        } finally {
          setLoading(false);
        }
      },
      async logout() {
        const token = getToken();
        sessionStorage.setItem('ems_allow_tab_close', '1');
        try {
          if (token) {
            await api('/auth/logout', { method: 'POST', body: {}, token });
          }
        } catch {
          // Always clear local session
        } finally {
          clearAuth();
          setUser(null);
        }
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

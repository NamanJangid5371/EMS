const API_URL = import.meta.env.VITE_API_URL || '/api';

function clearLegacyAuth() {
  try {
    localStorage.removeItem('ems_token');
    localStorage.removeItem('ems_user');
  } catch {
    // ignore
  }
}

clearLegacyAuth();

export function getToken() {
  return sessionStorage.getItem('ems_token');
}

export function setAuth(token, user) {
  sessionStorage.setItem('ems_token', token);
  sessionStorage.setItem('ems_user', JSON.stringify(user));
  clearLegacyAuth();
}

export function clearAuth() {
  sessionStorage.removeItem('ems_token');
  sessionStorage.removeItem('ems_user');
  clearLegacyAuth();
}

export function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem('ems_user') || 'null');
  } catch {
    return null;
  }
}

export async function api(path, { method = 'GET', body, token } = {}, attempt = 0) {
  const headers = { 'Content-Type': 'application/json' };
  const auth = token ?? getToken();
  if (auth) headers.Authorization = `Bearer ${auth}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return api(path, { method, body, token }, attempt + 1);
    }
    throw new Error('Cannot reach the API. Confirm the backend is running on port 5000.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/logout')) {
      clearAuth();
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.assign('/login');
      }
    }
    const err = new Error(data.message || 'Request failed');
    err.status = res.status;
    err.errors = data.errors;
    throw err;
  }
  return data;
}

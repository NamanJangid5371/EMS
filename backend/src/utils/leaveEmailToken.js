import crypto from 'crypto';
import config from '../config/index.js';

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createLeaveEmailToken({ leaveId, managerUserId, action }) {
  const payload = {
    leaveId: String(leaveId),
    managerUserId: String(managerUserId),
    action,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyLeaveEmailToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', config.jwtSecret).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.leaveId || !payload?.managerUserId || !payload?.action) return null;
    if (payload.exp && Number(payload.exp) < Date.now()) return null;
    if (!['approve', 'reject'].includes(payload.action)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function leaveEmailActionUrl(token) {
  const base = (config.apiPublicUrl || `http://127.0.0.1:${config.port}`).replace(/\/$/, '');
  return `${base}/api/leaves/email-action?token=${encodeURIComponent(token)}`;
}

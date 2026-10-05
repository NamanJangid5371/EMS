import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import { fail } from '../utils/apiResponse.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return fail(res, 'Authentication required', 401);

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user || user.status !== 'active') {
      return fail(res, 'Invalid or inactive account', 401);
    }

    req.user = user;
    next();
  } catch {
    return fail(res, 'Invalid or expired token', 401);
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 'Forbidden', 403);
    }
    next();
  };
}

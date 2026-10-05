import dotenv from 'dotenv';

dotenv.config();

const emailUser = String(process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
const emailPass = String(process.env.EMAIL_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();

const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/appinop_ems',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  adminPortalUrl: process.env.ADMIN_PORTAL_URL || 'http://127.0.0.1:3000',
  managerPortalUrl: process.env.MANAGER_PORTAL_URL || 'http://127.0.0.1:3001',
  employeePortalUrl: process.env.EMPLOYEE_PORTAL_URL || 'http://127.0.0.1:3002',
  apiPublicUrl: process.env.API_PUBLIC_URL || `http://127.0.0.1:${Number(process.env.PORT) || 5000}`,
  /** Gmail SMTP defaults — override with SMTP_HOST / SMTP_PORT if needed */
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT) || 465,
  smtpSecure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
  emailUser,
  emailPass,
  smtpFrom: process.env.SMTP_FROM || (emailUser ? `Appinop EMS <${emailUser}>` : 'Appinop EMS <noreply@appinop.com>'),
};

export default config;

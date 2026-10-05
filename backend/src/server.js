import app from './app.js';
import config from './config/index.js';
import { connectDb } from './config/db.js';
import User from './models/User.js';
import { runSeed } from './scripts/seed.js';
import { repairBufferedLateStatuses } from './services/attendanceService.js';
import { repairWeekendLeaveAccounting } from './controllers/leaveController.js';
import { verifySmtpConnection } from './utils/mailer.js';
import { maybeSendMissingCheckoutReminders } from './utils/attendanceReminders.js';

const DEMO_PASSWORDS = {
  'admin@appinop.com': 'Admin@123',
  'manager@appinop.com': 'Manager@123',
  'employee@appinop.com': 'Employee@123',
  'neha@appinop.com': 'Employee@123',
};

async function backfillLoginPasswords() {
  for (const [email, password] of Object.entries(DEMO_PASSWORDS)) {
    await User.updateOne(
      {
        email,
        $or: [{ loginPassword: { $exists: false } }, { loginPassword: '' }, { loginPassword: null }],
      },
      { $set: { loginPassword: password } }
    );
  }
}

async function start() {
  await connectDb();

  const userCount = await User.countDocuments();
  if (userCount === 0) {
    console.log('No users found — running initial demo seed (only once while DB has data)...');
    const result = await runSeed({ clear: false });
    result.accounts.forEach((a) => {
      console.log(`  ${a.role}: ${a.email} / ${a.password}`);
    });
  } else {
    console.log(`Database ready (${userCount} user account(s) — deletions persist across restarts)`);
  }

  await backfillLoginPasswords();

  try {
    const fixed = await repairBufferedLateStatuses();
    if (fixed > 0) {
      console.log(`Corrected ${fixed} attendance record(s) that were late within the login buffer`);
    }
  } catch (err) {
    console.error('Attendance buffer repair skipped:', err.message);
  }

  try {
    const weekend = await repairWeekendLeaveAccounting();
    if (weekend.leaveFixed || weekend.balanceRefunded || weekend.attendanceCleared) {
      console.log(
        `Weekend leave repair: ${weekend.leaveFixed} leave day count(s) fixed, ` +
          `${weekend.balanceRefunded} day(s) refunded to balances, ` +
          `${weekend.attendanceCleared} Sat/Sun leave mark(s) cleared`
      );
    }
  } catch (err) {
    console.error('Weekend leave repair skipped:', err.message);
  }

  const smtp = await verifySmtpConnection();
  if (smtp.ok) console.log(`[mailer] ${smtp.message}`);
  else console.warn(`[mailer] ${smtp.message}`);

  app.listen(config.port, '127.0.0.1', () => {
    console.log(`Appinop EMS API listening on http://127.0.0.1:${config.port}`);
  });

  maybeSendMissingCheckoutReminders().catch((err) => {
    console.error('Missing checkout reminder skipped:', err.message);
  });
  setInterval(() => {
    maybeSendMissingCheckoutReminders().catch((err) => {
      console.error('Missing checkout reminder skipped:', err.message);
    });
  }, 30 * 60 * 1000);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

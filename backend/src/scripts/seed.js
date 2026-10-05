import mongoose from 'mongoose';
import config from '../config/index.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Announcement from '../models/Announcement.js';
import AuditLog from '../models/AuditLog.js';
import Task from '../models/Task.js';

function startOfDay(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function connect() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2500 });
    console.log(`Connected to ${config.mongoUri}`);
    return null;
  } catch {
    console.warn('Local MongoDB unavailable. Seeding requires a running MongoDB or use API auto-seed on memory boot.');
    throw new Error('MongoDB not available. Start MongoDB locally, or run the API (memory mode) which auto-seeds.');
  }
}

async function upsertUserEmployee({
  employeeId,
  email,
  password,
  role,
  name,
  phone,
  designation,
  departmentId,
  managerId,
}) {
  const passwordHash = await User.hashPassword(password);
  let user = await User.findOne({ employeeId });
  if (!user) {
    user = await User.create({
      employeeId,
      email,
      passwordHash,
      loginPassword: password,
      role,
      status: 'active',
    });
  } else {
    user.email = email;
    user.passwordHash = passwordHash;
    user.loginPassword = password;
    user.role = role;
    user.status = 'active';
    await user.save();
  }

  let employee = await Employee.findOne({ employeeId });
  if (!employee) {
    employee = await Employee.create({
      employeeId,
      userId: user._id,
      name,
      email,
      phone,
      designation,
      departmentId: departmentId || null,
      managerId: managerId || null,
      joiningDate: new Date('2024-01-15'),
    });
  } else {
    Object.assign(employee, {
      name,
      email,
      phone,
      designation,
      departmentId: departmentId || null,
      managerId: managerId || null,
      userId: user._id,
    });
    await employee.save();
  }

  user.employeeProfile = employee._id;
  await user.save();
  return { user, employee };
}

export async function runSeed({ clear = true } = {}) {
  if (clear) {
    await Promise.all([
      User.deleteMany({}),
      Employee.deleteMany({}),
      Department.deleteMany({}),
      Attendance.deleteMany({}),
      Leave.deleteMany({}),
      Announcement.deleteMany({}),
      AuditLog.deleteMany({}),
      Task.deleteMany({}),
    ]);
  }

  const engineering = await Department.create({
    name: 'Engineering',
    description: 'Product engineering and delivery',
    status: 'active',
  });
  const hr = await Department.create({
    name: 'Human Resources',
    description: 'People operations',
    status: 'active',
  });

  const admin = await upsertUserEmployee({
    employeeId: 'ADM001',
    email: 'admin@appinop.com',
    password: 'Admin@123',
    role: 'admin',
    name: 'Appinop Admin',
    phone: '9000000001',
    designation: 'System Administrator',
    departmentId: hr._id,
  });

  const manager = await upsertUserEmployee({
    employeeId: 'MGR001',
    email: 'manager@appinop.com',
    password: 'Manager@123',
    role: 'manager',
    name: 'Riya Sharma',
    phone: '9000000002',
    designation: 'Engineering Manager',
    departmentId: engineering._id,
  });

  engineering.managerId = manager.employee._id;
  await engineering.save();

  const emp1 = await upsertUserEmployee({
    employeeId: 'EMP001',
    email: 'employee@appinop.com',
    password: 'Employee@123',
    role: 'employee',
    name: 'Aarav Patel',
    phone: '9000000003',
    designation: 'Software Engineer',
    departmentId: engineering._id,
    managerId: manager.employee._id,
  });

  const emp2 = await upsertUserEmployee({
    employeeId: 'EMP002',
    email: 'neha@appinop.com',
    password: 'Employee@123',
    role: 'employee',
    name: 'Neha Verma',
    phone: '9000000004',
    designation: 'QA Engineer',
    departmentId: engineering._id,
    managerId: manager.employee._id,
  });

  await Attendance.create([
    {
      employeeId: emp1.employee._id,
      date: startOfDay(),
      status: 'present',
      checkIn: new Date(),
    },
    {
      employeeId: emp2.employee._id,
      date: startOfDay(),
      status: 'late',
      checkIn: new Date(),
    },
  ]);

  await Leave.create({
    employeeId: emp1.employee._id,
    type: 'casual',
    startDate: startOfDay(new Date(Date.now() + 3 * 86400000)),
    endDate: startOfDay(new Date(Date.now() + 3 * 86400000)),
    reason: 'Personal errand',
    days: 1,
    status: 'pending',
  });

  await Announcement.create([
    {
      title: 'Welcome to Appinop EMS',
      message: 'Use your role portal to manage workforce operations.',
      audience: 'company',
      createdBy: admin.user._id,
    },
    {
      title: 'Engineering sprint kickoff',
      message: 'Team stand-up at 10:00 AM tomorrow.',
      audience: 'team',
      departmentId: engineering._id,
      createdBy: manager.user._id,
    },
  ]);

  await Task.create([
    {
      projectName: 'Appinop EMS',
      title: 'Implement employee dashboard widgets',
      description: 'Show assigned work with project, task, deadline and assigned date.',
      deadline: startOfDay(new Date(Date.now() + 7 * 86400000)),
      assignedAt: new Date(),
      assignedTo: emp1.employee._id,
      assignedBy: manager.user._id,
      status: 'assigned',
    },
    {
      projectName: 'Quality Sprint',
      title: 'Regression test leave workflow',
      deadline: startOfDay(new Date(Date.now() + 5 * 86400000)),
      assignedAt: new Date(),
      assignedTo: emp2.employee._id,
      assignedBy: manager.user._id,
      status: 'assigned',
    },
  ]);

  await AuditLog.create({
    userId: admin.user._id,
    action: 'seed_database',
    entity: 'system',
    entityId: 'bootstrap',
    meta: { note: 'Initial seed completed' },
  });

  return {
    accounts: [
      { role: 'admin', email: 'admin@appinop.com', password: 'Admin@123', portal: ':3000' },
      { role: 'manager', email: 'manager@appinop.com', password: 'Manager@123', portal: ':3001' },
      { role: 'employee', email: 'employee@appinop.com', password: 'Employee@123', portal: ':3002' },
    ],
  };
}

async function main() {
  await connect();
  const result = await runSeed();
  console.log('Seed complete. Demo accounts:');
  result.accounts.forEach((a) => {
    console.log(`  ${a.role.padEnd(8)} ${a.email.padEnd(24)} / ${a.password} -> ${a.portal}`);
  });
  await mongoose.disconnect();
}

const isDirect = process.argv[1] && process.argv[1].includes('seed.js');
if (isDirect) {
  main().catch(async (err) => {
    console.error(err.message || err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

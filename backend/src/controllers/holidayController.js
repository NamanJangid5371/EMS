import { body } from 'express-validator';
import Holiday from '../models/Holiday.js';
import Announcement from '../models/Announcement.js';
import { success, fail } from '../utils/apiResponse.js';
import { startOfDay } from '../services/attendanceService.js';
import { writeAudit } from '../utils/audit.js';

export const holidayValidators = [
  body('date').isISO8601(),
  body('name').isString().trim().notEmpty(),
];

export async function listHolidays(req, res) {
  const { from, to, year, month } = req.query;
  const filter = {};
  if (year && month) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
    filter.date = { $gte: start, $lte: end };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(from);
    if (to) filter.date.$lte = startOfDay(to);
  }
  const items = await Holiday.find(filter).sort({ date: 1 });
  return success(res, { items });
}

export async function createHoliday(req, res) {
  const date = startOfDay(req.body.date);
  const existing = await Holiday.findOne({ date });
  if (existing) return fail(res, 'A holiday already exists on this date', 409);
  const holiday = await Holiday.create({
    date,
    name: req.body.name.trim(),
    createdBy: req.user._id,
  });

  const dateLabel = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  await Announcement.create({
    title: `Holiday: ${holiday.name}`,
    message: `${holiday.name} is a company holiday on ${dateLabel}.`,
    audience: 'company',
    createdBy: req.user._id,
  });

  await writeAudit({
    userId: req.user._id,
    action: 'create_holiday',
    entity: 'holiday',
    entityId: holiday._id.toString(),
    meta: { name: holiday.name, date: date.toISOString() },
  });

  return success(res, holiday, 'Holiday added and announced', 201);
}

export async function deleteHoliday(req, res) {
  const holiday = await Holiday.findByIdAndDelete(req.params.id);
  if (!holiday) return fail(res, 'Holiday not found', 404);
  return success(res, holiday, 'Holiday removed');
}

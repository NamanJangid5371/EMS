import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'half_day', 'on_leave'],
      default: 'present',
    },
    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    workHours: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);

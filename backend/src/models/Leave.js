import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    type: { type: String, enum: ['annual', 'sick', 'casual', 'unpaid'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decisionAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' },
    previousDecision: {
      status: { type: String, enum: ['approved', 'rejected'], default: undefined },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      decisionNote: { type: String, default: '' },
      decisionAt: { type: Date, default: null },
    },
    days: { type: Number, required: true, min: 0 },
    /** Working days the person still logged in — those days are not counted as leave. */
    voidedDates: { type: [Date], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Leave', leaveSchema);

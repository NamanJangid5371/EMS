import mongoose from 'mongoose';

const hireRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    loginPassword: { type: String, required: true },
    phone: { type: String, default: '' },
    designation: { type: String, default: '' },
    joiningDate: { type: Date, default: Date.now },
    dateOfBirth: { type: Date, default: null },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relation: { type: String, default: '' },
    },
    managerNote: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decisionAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' },
    createdEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  },
  { timestamps: true }
);

hireRequestSchema.index({ status: 1, createdAt: -1 });
hireRequestSchema.index({ requestedBy: 1, createdAt: -1 });

export default mongoose.model('HireRequest', hireRequestSchema);

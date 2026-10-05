import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    /** Preferred email used for leave notices / Reply-To to admin & manager */
    notificationEmail: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '' },
    designation: { type: String, default: '' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    joiningDate: { type: Date, default: Date.now },
    dateOfBirth: { type: Date, default: null },
    employmentStatus: {
      type: String,
      enum: ['active', 'inactive', 'on_leave'],
      default: 'active',
    },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relation: { type: String, default: '' },
    },
    leaveBalance: {
      annual: { type: Number, default: 18 },
      sick: { type: Number, default: 10 },
      casual: { type: Number, default: 6 },
    },
    bankDetails: {
      accountHolderName: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      branchName: { type: String, default: '' },
    },
    performance: {
      taskCompletion: { type: Number, min: 0, max: 10, default: null },
      monthlyAttendance: { type: Number, min: 0, max: 10, default: null },
      workQuality: { type: Number, min: 0, max: 10, default: null },
      aptitude: { type: Number, min: 0, max: 10, default: null },
      remarks: { type: String, default: '' },
      updatedAt: { type: Date, default: null },
    },
    education: {
      graduation: {
        degree: { type: String, default: '' },
        institution: { type: String, default: '' },
        university: { type: String, default: '' },
        year: { type: String, default: '' },
      },
      postGraduation: {
        degree: { type: String, default: '' },
        institution: { type: String, default: '' },
        university: { type: String, default: '' },
        year: { type: String, default: '' },
      },
    },
    documents: [
      {
        name: { type: String, required: true, trim: true },
        url: { type: String, default: '', trim: true },
        note: { type: String, default: '', trim: true },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],
    managerNotes: [
      {
        kind: { type: String, enum: ['comment', 'remark'], required: true },
        text: { type: String, required: true, trim: true },
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        authorName: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Employee', employeeSchema);

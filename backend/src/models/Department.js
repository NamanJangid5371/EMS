import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Department', departmentSchema);

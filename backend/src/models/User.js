import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    /** Admin-visible login password (set on create/reset). Not used for auth. */
    loginPassword: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'manager', 'employee'], required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    employeeProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

export default mongoose.model('User', userSchema);

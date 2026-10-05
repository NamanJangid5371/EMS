import mongoose from 'mongoose';

const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    leaveNotificationEmail: { type: String, default: '', lowercase: true, trim: true },
    lastMissingCheckoutReminderDate: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('AppSettings', appSettingsSchema);

import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['leave', 'attendance', 'hire', 'announcement', 'employee', 'approval', 'task', 'system'],
      default: 'system',
    },
    link: { type: String, default: '' },
    entity: { type: String, default: '' },
    entityId: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);

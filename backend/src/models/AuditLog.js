import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    actorName: { type: String, default: '' },
    actorEmployeeId: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    actorDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    actorDepartmentName: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ entity: 1, timestamp: -1 });
auditLogSchema.index({ actorDepartmentId: 1, timestamp: -1 });

export default mongoose.model('AuditLog', auditLogSchema);

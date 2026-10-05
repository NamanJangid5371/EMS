import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    deadline: { type: Date, required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['assigned', 'in_progress', 'completed', 'cancelled'],
      default: 'assigned',
    },
    completionNote: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ assignedTo: 1, deadline: 1 });

export default mongoose.model('Task', taskSchema);

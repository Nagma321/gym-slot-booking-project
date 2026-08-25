const { mongoose } = require('../config/mongo');

const ACTIONS = [
  'USER_REGISTERED',
  'USER_LOGGED_IN',
  'BOOKING_CREATED',
  'BOOKING_REJECTED_FULL',
  'BOOKING_REJECTED_DUPLICATE',
  'BOOKING_CANCELLED',
];

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: false, index: true },
    action: { type: String, required: true, enum: ACTIONS, index: true },
    slotId: { type: Number, required: false, index: true },
    bookingId: { type: Number, required: false },
    // Free-form, non-sensitive contextual data only. Never store
    // passwords, password hashes, JWTs, or other secrets here.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

activityLogSchema.index({ timestamp: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = { ActivityLog, ACTIONS };

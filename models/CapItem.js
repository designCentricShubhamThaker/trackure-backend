import mongoose from 'mongoose';
import { teamTrackingSchema } from './TeamTracking.js';

const CapItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem', required: true },
  orderNumber: { type: String, required: true },
  cap_name: String,
  neck_size: String,
  quantity: Number,
  process: String,
  material: String,
  team: String,
  status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
  team_tracking: teamTrackingSchema
}, { timestamps: true });

export default mongoose.model('CapItem', CapItemSchema);
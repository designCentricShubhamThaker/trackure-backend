import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
  order_number: { type: String, required: true },
  name: { type: String }, // Optional: Item name or label
  team_assignments: {
    glass: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GlassItem' }],
    caps: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CapItem' }],
    boxes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BoxItem' }],
    pumps: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PumpItem' }]
  },
  // Add this field to track team completion status
  team_status: {
    glass: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    caps: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    boxes: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    pumps: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' }
  }
}, { timestamps: true });

export default mongoose.model('OrderItem', OrderItemSchema);

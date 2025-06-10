import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
  order_number: { type: String, required: true },
  name: { type: String },
  
  team_assignments: {
    glass: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GlassItem' }],
 
  },
  team_status: {
    glass: { type: String, enum: ['Pending', 'In Progress', 'Completed'], default: 'Pending' },
    
  }
}, { timestamps: true });

export default mongoose.model('OrderItem', OrderItemSchema);
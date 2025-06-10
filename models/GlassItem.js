// import mongoose from 'mongoose';
// import { teamTrackingSchema } from './TeamTracking.js';

// const GlassItemSchema = new mongoose.Schema({
//   itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem', required: true },
//   orderNumber: { type: String, required: true },
  
//   // Updated fields according to new structure
//   item_name: { type: String, required: true },
//   quantity: { type: Number, required: true },
//   rate_per_1000: { type: Number, required: true },
//   eop: { type: Number, required: true }, // Estimated Order Price
//   team: { 
//     type: String, 
//     enum: ['Team 1', 'Team 2', 'Team 3'],
//     default: 'Team 1',
//     required: true 
//   },
//   estimated_delivery: { type: Date },
  
//   status: {
//     type: String,
//     enum: ['Pending', 'In Progress', 'Completed'],
//     default: 'Pending'
//   },

//   team_tracking: teamTrackingSchema
// }, { timestamps: true });

// export default mongoose.model('GlassItem', GlassItemSchema);


import mongoose from 'mongoose';
import { teamTrackingSchema } from './TeamTracking.js';

const GlassItemSchema = new mongoose.Schema({
 itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem', required: true },
  order_number: { type: String, required: true },
  
  // Glass item details matching your frontend structure
  item_name: { type: String, required: true }, // Glass Bottle 100ml, etc.
  quantity: { type: Number, required: true },
  rate_per_1000: { type: Number, required: true },
  eop: { type: Number, required: true }, // Calculated EOP for this item
  
  team: { 
    type: String, 
    enum: ['Team 1', 'Team 2', 'Team 3'],
    default: 'Team 1',
    required: true 
  },
  
  estimated_delivery: { type: String }, // Storing as string to match frontend
  
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed'],
    default: 'Pending'
  },

  team_tracking: teamTrackingSchema
}, { timestamps: true });

export default mongoose.model('GlassItem', GlassItemSchema);
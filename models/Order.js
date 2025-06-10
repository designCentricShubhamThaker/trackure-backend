// Order.js
import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  item_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem' }],
  order_number: { type: String, required: true, unique: true },
  dispatcher_name: { type: String, required: true },
  customer_name: { type: String, required: true },
  order_status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed'],
    default: 'Pending'
  },

  eop_details: {
    itemsCost: { type: Number, required: true, default: 0 },
    shippingAndHandling: { type: Number, required: true, default: 0 },
    taxes: { type: Number, required: true, default: 0 },
    additionalFees: { type: Number, required: true, default: 0 },
    totalEOP: { type: Number, required: true, default: 0 }
  },

  eop_config: {
    shippingCost: { type: Number, default: 500 },
    handlingCost: { type: Number, default: 200 },
    taxRate: { type: Number, default: 0.18 }, 
    insuranceFee: { type: Number, default: 100 },
    expeditedShippingFee: { type: Number, default: 0 },
    specialHandlingFee: { type: Number, default: 0 }
  }
}, { timestamps: true });

export default mongoose.model('Order', OrderSchema);
import mongoose from 'mongoose';

const DeliveryTrackingSchema = new mongoose.Schema({
  orderId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  order_number: { type: String, required: true },
  currentStep: { type: Number, default: 1 },
  completionPercentage: { type: Number, default: 0 },
  customerName: { type: String, required: true },
  stepTitle: { type: String },
  stepDescription: { type: String },
  totalSteps: { type: Number, default: 5 },
  orderStatus: { 
    type: String, 
    enum: ['In Progress', 'Completed', 'Cancelled'], 
    default: 'In Progress' 
  },
  customerAddress: { type: String },
  customerPhone: { type: String },
  customerEmail: { type: String, required: true },
  orderDate: { type: Date, default: Date.now },
  estimatedDelivery: { type: String },

  items: [{ 
    name: String,
    quantity: Number,
    price: Number 
  }],
  lastUpdated: { type: Date, default: Date.now },
  emailSent: { type: Boolean, default: false },
  emailSentAt: { type: Date }
}, {
  timestamps: true
});

export default  mongoose.model('Tracking', DeliveryTrackingSchema);
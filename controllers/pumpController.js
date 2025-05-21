import PumpItem from '../models/PumpItem.js';
import OrderItem from '../models/OrderItem.js';

// Get all pump items
export const getAllPumpItems = async (req, res, next) => {
  try {
    const pumpItems = await PumpItem.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: pumpItems });
  } catch (error) {
    next(error);
  }
};

// Get pump item by ID
export const getPumpItemById = async (req, res, next) => {
  try {
    const pumpItem = await PumpItem.findById(req.params.id);
    
    if (!pumpItem) {
      return res.status(404).json({ success: false, message: 'Pump item not found' });
    }
    
    res.status(200).json({ success: true, data: pumpItem });
  } catch (error) {
    next(error);
  }
};

// Create new pump item
export const createPumpItem = async (req, res, next) => {
  try {
    const { orderItem_id } = req.params;
    const orderItem = await OrderItem.findById(orderItem_id);
    
    if (!orderItem) {
      return res.status(404).json({ success: false, message: 'Order item not found' });
    }
    
    const pumpItem = new PumpItem({
      ...req.body,
      itemId: orderItem._id,
      orderNumber: orderItem.order_number
    });
    
    await pumpItem.save();
    
    // Add pump item to order item's team assignments
    orderItem.team_assignments.pumps.push(pumpItem._id);
    await orderItem.save();
    
    res.status(201).json({ success: true, data: pumpItem });
  } catch (error) {
    next(error);
  }
};

// Update pump item
export const updatePumpItem = async (req, res, next) => {
  try {
    const pumpItem = await PumpItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    if (!pumpItem) {
      return res.status(404).json({ success: false, message: 'Pump item not found' });
    }
    
    res.status(200).json({ success: true, data: pumpItem });
  } catch (error) {
    next(error);
  }
};

// Update pump item team tracking
export const updatePumpItemTracking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { qty_completed, updated_by } = req.body;
    
    const pumpItem = await PumpItem.findById(id);
    
    if (!pumpItem) {
      return res.status(404).json({ success: false, message: 'Pump item not found' });
    }
    
    // Add completed entry
    pumpItem.team_tracking.completed_entries.push({
      qty_completed,
      updated_by,
      timestamp: new Date()
    });
    
    // Update total completed quantity
    pumpItem.team_tracking.total_completed_qty += qty_completed;
    
    // Check if completed
    if (pumpItem.team_tracking.total_completed_qty >= pumpItem.quantity) {
      pumpItem.team_tracking.status = 'Completed';
      pumpItem.status = 'Done';
    }
    
    await pumpItem.save();
    
    res.status(200).json({ success: true, data: pumpItem });
  } catch (error) {
    next(error);
  }
};

// Delete pump item
export const deletePumpItem = async (req, res, next) => {
  try {
    const pumpItem = await PumpItem.findById(req.params.id);
    
    if (!pumpItem) {
      return res.status(404).json({ success: false, message: 'Pump item not found' });
    }
    
    // Remove reference from order item
    await OrderItem.updateOne(
      { _id: pumpItem.itemId },
      { $pull: { 'team_assignments.pumps': pumpItem._id } }
    );
    
    await pumpItem.deleteOne();
    
    res.status(200).json({ success: true, message: 'Pump item deleted successfully' });
  } catch (error) {
    next(error);
  }
};
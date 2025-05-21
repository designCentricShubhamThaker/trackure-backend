import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import GlassItem from '../models/GlassItem.js';
import CapItem from '../models/CapItem.js';
import BoxItem from '../models/BoxItem.js';
import PumpItem from '../models/PumpItem.js';
import mongoose from 'mongoose';

export const getAllOrders = async (req, res, next) => {
  try {
    // Get the orderType from query parameters (pending, completed, or all)
    const { orderType } = req.query;
    
    // Create a filter object that will be used in the database query
    let filter = {};
    
    // Apply filtering based on orderType
    if (orderType === 'pending') {
      filter.order_status = 'Pending';
    } else if (orderType === 'completed') {
      filter.order_status = 'Completed';
    }
    // If orderType is not specified or is 'all', no filter is applied
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.glass team_assignments.caps team_assignments.boxes team_assignments.pumps',
        },
      });

    res.status(200).json({ 
      success: true, 
      count: orders.length, 
      data: orders 
    });
  } catch (error) {
    next(error);
  }
};


export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.glass team_assignments.caps team_assignments.boxes team_assignments.pumps',
        },
      });
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Order not found with invalid ID format' });
    }
    next(error);
  }
};

export const createOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      order_number, 
      dispatcher_name, 
      customer_name, 
      items = [] 
    } = req.body;

    if (!order_number || !dispatcher_name || !customer_name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide order_number, dispatcher_name, and customer_name'
      });
    }

    const orderExists = await Order.findOne({ order_number });
    if (orderExists) {
      return res.status(400).json({
        success: false,
        message: `Order with number ${order_number} already exists`
      });
    }

    const newOrder = new Order({
      order_number,
      dispatcher_name,
      customer_name,
      order_status: req.body.order_status || 'Pending',
      item_ids: []
    });
    await newOrder.save({ session });

    const itemIds = [];

    for (const item of items) {
      const orderItem = new OrderItem({
        order_number,
        name: item.name || `Item for ${order_number}`,
        team_assignments: {
          glass: [],
          caps: [],
          boxes: [],
          pumps: []
        }
      });
      
      await orderItem.save({ session });
      itemIds.push(orderItem._id);

      if (item.glass && item.glass.length > 0) {
        for (const glassData of item.glass) {
          const glassItem = new GlassItem({
            itemId: orderItem._id,
            orderNumber: order_number,
            glass_name: glassData.glass_name,
            quantity: glassData.quantity,
            weight: glassData.weight,
            neck_size: glassData.neck_size,
            decoration: glassData.decoration,
            decoration_no: glassData.decoration_no,
            decoration_details: glassData.decoration_details,
            team: glassData.team || 'Glass',
            status: 'Pending',
            team_tracking: {
              total_completed_qty: 0,
              completed_entries: [],
              status: 'Pending'
            }
          });
          
          await glassItem.save({ session });
          orderItem.team_assignments.glass.push(glassItem._id);
        }
      }
      
      if (item.caps && item.caps.length > 0) {
        for (const capData of item.caps) {
          const capItem = new CapItem({
            itemId: orderItem._id,
            orderNumber: order_number,
            cap_name: capData.cap_name,
            neck_size: capData.neck_size,
            quantity: capData.quantity,
            process: capData.process,
            material: capData.material,
            team: capData.team || 'Caps',
            status: 'Pending',
            team_tracking: {
              total_completed_qty: 0,
              completed_entries: [],
              status: 'Pending'
            }
          });
          
          await capItem.save({ session });
          orderItem.team_assignments.caps.push(capItem._id);
        }
      }
      
      if (item.boxes && item.boxes.length > 0) {
        for (const boxData of item.boxes) {
          const boxItem = new BoxItem({
            itemId: orderItem._id,
            orderNumber: order_number,
            box_name: boxData.box_name,
            quantity: boxData.quantity,
            approval_code: boxData.approval_code,
            team: boxData.team || 'Boxes',
            status: 'Pending',
            team_tracking: {
              total_completed_qty: 0,
              completed_entries: [],
              status: 'Pending'
            }
          });
          
          await boxItem.save({ session });
          orderItem.team_assignments.boxes.push(boxItem._id);
        }
      }
      
      if (item.pumps && item.pumps.length > 0) {
        for (const pumpData of item.pumps) {
          const pumpItem = new PumpItem({
            itemId: orderItem._id,
            orderNumber: order_number,
            pump_name: pumpData.pump_name,
            neck_type: pumpData.neck_type,
            quantity: pumpData.quantity,
            team: pumpData.team || 'Pumps',
            status: 'Pending',
            team_tracking: {
              total_completed_qty: 0,
              completed_entries: [],
              status: 'Pending'
            }
          });
          
          await pumpItem.save({ session });
          orderItem.team_assignments.pumps.push(pumpItem._id);
        }
      }
      
      await orderItem.save({ session });
    }
  
    newOrder.item_ids = itemIds;
    await newOrder.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    // Fetch the fully populated order after creation
    const populatedOrder = await Order.findById(newOrder._id)
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.glass team_assignments.caps team_assignments.boxes team_assignments.pumps',
        },
      });
    
    res.status(201).json({ 
      success: true, 
      message: 'Order created successfully',
      data: populatedOrder 
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error. Order number must be unique.'
      });
    }
    
    next(error);
  }
};

export const updateOrder = async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate({
      path: 'item_ids',
      populate: {
        path: 'team_assignments.glass team_assignments.caps team_assignments.boxes team_assignments.pumps',
      },
    });
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export const deleteOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const orderItems = await OrderItem.find({ order_number: order.order_number });
    
    for (const item of orderItems) {
      await GlassItem.deleteMany({ itemId: item._id }, { session });
      await CapItem.deleteMany({ itemId: item._id }, { session });      
      await BoxItem.deleteMany({ itemId: item._id }, { session });
      await PumpItem.deleteMany({ itemId: item._id }, { session });
      await item.deleteOne({ session });
    }
    await order.deleteOne({ session });
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

export const createOrderItem = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { order_id } = req.params;
    const order = await Order.findById(order_id);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const orderItem = new OrderItem({
      ...req.body,
      order_number: order.order_number,
      team_assignments: {
        glass: [],
        caps: [],
        boxes: [],
        pumps: []
      }
    });
    
    await orderItem.save({ session });
    
    order.item_ids.push(orderItem._id);
    await order.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    const populatedItem = await OrderItem.findById(orderItem._id)
      .populate('team_assignments.glass team_assignments.caps team_assignments.boxes team_assignments.pumps');
    
    res.status(201).json({ success: true, data: populatedItem });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
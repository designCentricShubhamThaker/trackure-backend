import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import GlassItem from '../models/GlassItem.js';
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
          path: 'team_assignments.glass',
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
          path: 'team_assignments.glass',
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
      items = [],
      eop_details,
      eop_config
    } = req.body;

    console.log('Received order data:', JSON.stringify(req.body, null, 2));

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
      eop_details: eop_details || {
        itemsCost: 0,
        shippingAndHandling: 0,
        taxes: 0,
        additionalFees: 0,
        totalEOP: 0
      },
      eop_config: eop_config || {
        shippingCost: 500,
        handlingCost: 200,
        taxRate: 0.18,
        insuranceFee: 100,
        expeditedShippingFee: 0,
        specialHandlingFee: 0
      },
      item_ids: []
    });
    
    await newOrder.save({ session });
    console.log('Order saved with ID:', newOrder._id);

    const itemIds = [];

    for (const item of items) {
      console.log('Processing item:', item.name);
      
      const orderItem = new OrderItem({
        order_number,
        name: item.name || `Item for ${order_number}`,
        team_assignments: {
          glass: []
        }
      });
      
      await orderItem.save({ session });
      itemIds.push(orderItem._id);
      console.log('OrderItem saved with ID:', orderItem._id);

      // Process glass items only
      if (item.glass && item.glass.length > 0) {
        for (const glassData of item.glass) {
          console.log('Processing glass data:', glassData);
          
          // Validate required fields before creating
          if (!glassData.item_name || !glassData.quantity || !glassData.rate_per_1000) {
            throw new Error(`Missing required fields for glass item: item_name, quantity, rate_per_1000`);
          }

          const glassItem = new GlassItem({
            itemId: orderItem._id,
            order_number: order_number,
            item_name: glassData.item_name,
            quantity: parseFloat(glassData.quantity),
            rate_per_1000: parseFloat(glassData.rate_per_1000),
            eop: parseFloat(glassData.eop) || 0,
            team: glassData.team || 'Team 1',
            estimated_delivery: glassData.estimated_delivery || '',
            status: glassData.status || 'Pending',
            team_tracking: glassData.team_tracking || {
              total_completed_qty: 0,
              completed_entries: [],
              status: 'Pending'
            }
          });
          
          await glassItem.save({ session });
          console.log('GlassItem saved with ID:', glassItem._id);
          orderItem.team_assignments.glass.push(glassItem._id);
        }
      }
      
      await orderItem.save({ session });
      console.log('OrderItem updated with assignments');
    }
  
    newOrder.item_ids = itemIds;
    await newOrder.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    console.log('Transaction committed successfully');

    // Fetch the fully populated order after creation
    const populatedOrder = await Order.findById(newOrder._id)
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.glass',
          model: 'GlassItem'
        },
      });
    
    console.log('Order creation completed successfully');
    
    res.status(201).json({ 
      success: true, 
      message: 'Order created successfully',
      data: populatedOrder 
    });
    
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Order creation failed:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error. Order number must be unique.'
      });
    }
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationErrors,
        details: error.message
      });
    }
    
    next(error);
  }
};

export const updateOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      order_number, 
      dispatcher_name, 
      customer_name, 
      order_status,
      items = [] 
    } = req.body;

    // Find the existing order with populated data
    const existingOrder = await Order.findById(req.params.id)
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.glass',
        },
      });
      
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Store the OLD order number before updating
    const oldOrderNumber = existingOrder.order_number;

    // Check if new order number conflicts with other orders
    if (order_number && order_number !== oldOrderNumber) {
      const orderExists = await Order.findOne({ 
        order_number, 
        _id: { $ne: req.params.id } 
      });
      if (orderExists) {
        return res.status(400).json({
          success: false,
          message: `Order with number ${order_number} already exists`
        });
      }
    }

    // Preserve existing tracking data
    const existingTrackingData = new Map();
    
    if (existingOrder.item_ids) {
      existingOrder.item_ids.forEach(item => {
        const itemKey = item.name;
        existingTrackingData.set(itemKey, {
          glass: {}
        });
        
        if (item.team_assignments?.glass) {
          item.team_assignments.glass.forEach(assignment => {
            const assignmentKey = getAssignmentKey(assignment);
            existingTrackingData.get(itemKey).glass[assignmentKey] = {
              team_tracking: assignment.team_tracking,
              status: assignment.status
            };
          });
        }
      });
    }

    function getAssignmentKey(assignment) {
      return `${assignment.item_name || assignment.name}_${assignment.team}`;
    }

    // Update order basic info
    existingOrder.order_number = order_number || existingOrder.order_number;
    existingOrder.dispatcher_name = dispatcher_name || existingOrder.dispatcher_name;
    existingOrder.customer_name = customer_name || existingOrder.customer_name;
    existingOrder.order_status = order_status || existingOrder.order_status;

    // Delete OrderItems using the OLD order number
    const existingOrderItems = await OrderItem.find({ order_number: oldOrderNumber });
    
    for (const item of existingOrderItems) {
      await GlassItem.deleteMany({ itemId: item._id }, { session });
      await item.deleteOne({ session });
    }

    // Clear the item_ids array
    existingOrder.item_ids = [];

    // Create new order items with NEW order number and preserved tracking data
    const itemIds = [];

    for (const item of items) {
      const orderItem = new OrderItem({
        order_number: existingOrder.order_number,
        name: item.name || `Item for ${existingOrder.order_number}`,
        team_assignments: {
          glass: []
        }
      });
      
      await orderItem.save({ session });
      itemIds.push(orderItem._id);

      const existingItemTracking = existingTrackingData.get(item.name) || {
        glass: {}
      };

      // Handle Glass Items with preserved tracking
      if (item.glass && item.glass.length > 0) {
        for (const glassData of item.glass) {
          const assignmentKey = getAssignmentKey(glassData);
          const existingTracking = existingItemTracking.glass[assignmentKey];
          
          const glassItem = new GlassItem({
            itemId: orderItem._id,
            order_number: existingOrder.order_number,
            item_name: glassData.item_name,
            quantity: parseFloat(glassData.quantity),
            rate_per_1000: parseFloat(glassData.rate_per_1000),
            eop: parseFloat(glassData.eop) || 0,
            team: glassData.team || 'Team 1',
            estimated_delivery: glassData.estimated_delivery || '',
            status: existingTracking?.status || glassData.status || 'Pending',
            team_tracking: existingTracking?.team_tracking || glassData.team_tracking || {
              total_completed_qty: 0,
              completed_entries: [],
              status: 'Pending'
            }
          });
          
          await glassItem.save({ session });
          orderItem.team_assignments.glass.push(glassItem._id);
        }
      }
      
      await orderItem.save({ session });
    }

    // Update the order with new item IDs
    existingOrder.item_ids = itemIds;
    await existingOrder.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    // Fetch the fully populated updated order
    const populatedOrder = await Order.findById(existingOrder._id)
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.glass',
        },
      });
    
    res.status(200).json({ 
      success: true, 
      message: 'Order updated successfully',
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
        glass: []
      }
    });
    
    await orderItem.save({ session });
    
    order.item_ids.push(orderItem._id);
    await order.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    const populatedItem = await OrderItem.findById(orderItem._id)
      .populate('team_assignments.glass');
    
    res.status(201).json({ success: true, data: populatedItem });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
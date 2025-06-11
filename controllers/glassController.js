import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js'; // Add this import
import GlassItem from '../models/GlassItem.js';
import mongoose from 'mongoose';


export const getGlassOrders = async (req, res, next) => {
  try {
    const { orderType } = req.query;
    let filter = {};

    if (orderType === 'pending') {
      filter.order_status = 'Pending';
    } else if (orderType === 'completed') {
      filter.order_status = 'Completed';
    }

    const orders = await Order.find(filter)
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.glass',
          model: 'GlassItem'
        }
      })
      .lean();

    const filteredOrders = orders
      .filter(order =>
        order.item_ids.some(item => item.team_assignments?.glass?.length > 0)
      )
      .map(order => {
        const filteredItems = order.item_ids
          .filter(item => item.team_assignments?.glass?.length > 0)
          .map(item => {
            const glassItems = item.team_assignments.glass;
            return {
              ...item,
              team_assignments: { glass: glassItems }
            };
          });

        return {
          ...order,
          item_ids: filteredItems
        };
      });

    res.status(200).json({
      success: true,
      count: filteredOrders.length,
      data: filteredOrders
    });
  } catch (error) {
    next(error);
  }
};

export const updateGlassTracking = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { orderNumber, itemId, updates, assignmentId, newEntry, newTotalCompleted, newStatus, qc_status } = req.body;

    const isBulkUpdate = Array.isArray(updates) && updates.length > 0;
    const isSingleUpdate = assignmentId && newEntry && newTotalCompleted !== undefined && newStatus;
    const isQcUpdate = qc_status && orderNumber && !itemId; // QC update only needs orderNumber and qc_status
    const isQcWithGlassUpdate = qc_status && orderNumber && itemId; // NEW: QC update with glass tracking

    if (!orderNumber || (!isBulkUpdate && !isSingleUpdate && !isQcUpdate && !isQcWithGlassUpdate)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields. Provide either: (orderNumber, itemId, updates[]) OR (orderNumber, itemId, assignmentId, newEntry, newTotalCompleted, newStatus) OR (orderNumber, qc_status) OR (orderNumber, itemId, assignmentId, newEntry, newTotalCompleted, newStatus, qc_status)'
      });
    }

    // Handle QC status update only (existing logic)
    if (isQcUpdate) {
      await session.withTransaction(async () => {
        await Order.findOneAndUpdate(
          { order_number: orderNumber },
          { $set: { qc_status: qc_status } },
          { session }
        );

        // Check if order should be completed (both glass and QC completed)
        const orderDoc = await Order.findOne({ order_number: orderNumber }).session(session);
       
        const orderCompletionResult = await Order.aggregate([
          { $match: { order_number: orderNumber } },
          {
            $lookup: {
              from: 'orderitems',
              localField: 'item_ids',
              foreignField: '_id',
              as: 'items',
              pipeline: [
                {
                  $lookup: {
                    from: 'glassitems',
                    localField: 'team_assignments.glass',
                    foreignField: '_id',
                    as: 'glass_assignments'
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              allItemsCompleted: {
                $allElementsTrue: {
                  $map: {
                    input: '$items',
                    as: 'item',
                    in: {
                      $cond: {
                        if: { $gt: [{ $size: '$$item.glass_assignments' }, 0] },
                        then: {
                          $allElementsTrue: {
                            $map: {
                              input: '$$item.glass_assignments',
                              as: 'assignment',
                              in: {
                                $gte: [
                                  { $ifNull: ['$$assignment.team_tracking.total_completed_qty', 0] },
                                  '$$assignment.quantity'
                                ]
                              }
                            }
                          }
                        },
                        else: true
                      }
                    }
                  }
                }
              }
            }
          },
          { $project: { allItemsCompleted: 1 } }
        ]).session(session);

        const orderResult = orderCompletionResult[0];
       
        if (orderResult?.allItemsCompleted && qc_status === 'Completed' && orderDoc.order_status !== 'Completed') {
          await Order.findOneAndUpdate(
            { order_number: orderNumber },
            { $set: { order_status: 'Completed' } },
            { session }
          );
        }
      });

      const updatedOrder = await Order.findOne({ order_number: orderNumber }).lean();

      return res.status(200).json({
        success: true,
        message: 'QC status updated successfully',
        data: { order: updatedOrder }
      });
    }

    // Rest of the existing glass tracking logic...
    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: 'itemId is required for glass tracking updates'
      });
    }

    const updatesArray = isBulkUpdate ? updates : [{
      assignmentId,
      newEntry,
      newTotalCompleted,
      newStatus
    }];

    for (const update of updatesArray) {
      if (!update.assignmentId || !update.newEntry || update.newTotalCompleted === undefined || !update.newStatus) {
        return res.status(400).json({
          success: false,
          message: 'Invalid update structure. Each update must have assignmentId, newEntry, newTotalCompleted, and newStatus'
        });
      }
    }

    await session.withTransaction(async () => {
      const item = await OrderItem.findById(itemId)
        .populate('team_assignments.glass')
        .session(session);

      if (!item) {
        throw new Error('Item not found');
      }

      const glassAssignments = item.team_assignments?.glass || [];

      for (const update of updatesArray) {
        const assignment = glassAssignments.find(a => a._id.toString() === update.assignmentId);

        if (!assignment) {
          throw new Error(`Glass assignment not found: ${update.assignmentId}`);
        }

        const currentCompleted = assignment.team_tracking?.total_completed_qty || 0;
        const remaining = assignment.quantity - currentCompleted;

        if (update.newEntry.quantity > remaining) {
          throw new Error(`Quantity ${update.newEntry.quantity} exceeds remaining quantity ${remaining} for assignment ${assignment.glass_name}`);
        }

        // Update the glass item with new tracking data
        await GlassItem.findByIdAndUpdate(
          update.assignmentId,
          {
            $set: {
              'team_tracking.total_completed_qty': update.newTotalCompleted,
              'team_tracking.last_updated': new Date(),
              status: update.newStatus,
              // NEW: Update QC status if provided
              ...(qc_status && { qc_status: qc_status })
            },
            $push: {
              'team_tracking.completed_entries': {
                ...update.newEntry,
                date: new Date(update.newEntry.date)
              }
            }
          },
          { session, new: true }
        );
      }

      const itemCompletionResult = await OrderItem.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(itemId) } },
        {
          $lookup: {
            from: 'glassitems',
            localField: 'team_assignments.glass',
            foreignField: '_id',
            as: 'glass_assignments'
          }
        },
        {
          $addFields: {
            allGlassCompleted: {
              $allElementsTrue: {
                $map: {
                  input: '$glass_assignments',
                  as: 'assignment',
                  in: {
                    $gte: [
                      { $ifNull: ['$$assignment.team_tracking.total_completed_qty', 0] },
                      '$$assignment.quantity'
                    ]
                  }
                }
              }
            }
          }
        },
        { $project: { allGlassCompleted: 1 } }
      ]).session(session);

      if (itemCompletionResult[0]?.allGlassCompleted) {
        await OrderItem.findByIdAndUpdate(
          itemId,
          { $set: { 'team_status.glass': 'Completed' } },
          { session }
        );

        const orderCompletionResult = await Order.aggregate([
          { $match: { order_number: orderNumber } },
          {
            $lookup: {
              from: 'orderitems',
              localField: 'item_ids',
              foreignField: '_id',
              as: 'items',
              pipeline: [
                {
                  $lookup: {
                    from: 'glassitems',
                    localField: 'team_assignments.glass',
                    foreignField: '_id',
                    as: 'glass_assignments'
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              allItemsCompleted: {
                $allElementsTrue: {
                  $map: {
                    input: '$items',
                    as: 'item',
                    in: {
                      $cond: {
                        if: { $gt: [{ $size: '$$item.glass_assignments' }, 0] },
                        then: {
                          $allElementsTrue: {
                            $map: {
                              input: '$$item.glass_assignments',
                              as: 'assignment',
                              in: {
                                $gte: [
                                  { $ifNull: ['$$assignment.team_tracking.total_completed_qty', 0] },
                                  '$$assignment.quantity'
                                ]
                              }
                            }
                          }
                        },
                        else: true
                      }
                    }
                  }
                }
              }
            }
          },
          { $project: { allItemsCompleted: 1, order_status: 1 } }
        ]).session(session);

        const orderResult = orderCompletionResult[0];

        if (orderResult?.allItemsCompleted) {
          const orderDoc = await Order.findOne({ order_number: orderNumber }).session(session);

          // NEW: Check if QC status should be updated for order-level completion
          if (qc_status === 'Completed' && orderDoc.order_status !== 'Completed') {
            await Order.findOneAndUpdate(
              { order_number: orderNumber },
              { $set: { order_status: 'Completed', qc_status: qc_status } },
              { session }
            );
          } else if (orderDoc.qc_status === 'Completed' && orderDoc.order_status !== 'Completed') {
            await Order.findOneAndUpdate(
              { order_number: orderNumber },
              { $set: { order_status: 'Completed' } },
              { session }
            );
          } else if (qc_status && !orderDoc.qc_status) {
            // Update order QC status if not already set
            await Order.findOneAndUpdate(
              { order_number: orderNumber },
              { $set: { qc_status: qc_status } },
              { session }
            );
          }
        }
      }
    });

    const updatedOrder = await Order.findOne({ order_number: orderNumber })
      .populate({
        path: 'item_ids',
        match: { 'team_assignments.glass': { $exists: true, $ne: [] } },
        populate: {
          path: 'team_assignments.glass',
          model: 'GlassItem'
        }
      })
      .lean();

    const responseData = {
      ...updatedOrder,
      item_ids: updatedOrder.item_ids.map(item => ({
        ...item,
        team_assignments: { glass: item.team_assignments.glass }
      }))
    };

    const updatedAssignments = updatesArray.map(update => ({
      assignmentId: update.assignmentId,
      newStatus: update.newStatus,
      totalCompleted: update.newTotalCompleted
    }));

    res.status(200).json({
      success: true,
      message: `Glass tracking${qc_status ? ' and QC status' : ''} updated successfully`,
      data: {
        order: responseData,
        updatedAssignments: isBulkUpdate ? updatedAssignments : updatedAssignments[0]
      }
    });

  } catch (error) {
    console.error('Error updating glass tracking:', error);

    if (error.message.includes('not found') || error.message.includes('exceeds')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
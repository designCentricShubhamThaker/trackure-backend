
import Order from '../models/Order.js';


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
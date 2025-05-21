
import Order from '../models/Order.js';
import GlassItem from '../models/GlassItem.js';

export const getGlassOrders = async (req, res) => {
  try {
    const orders = await Order.find()
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

    res.status(200).json({ success: true, data: filteredOrders });
  } catch (error) {
    console.error('Error fetching glass orders:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

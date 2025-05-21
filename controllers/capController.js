import Order from "../models/Order.js";

export const getCapOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.caps',
          model: 'CapItem'
        }
      })
      .lean();

    const filteredOrders = orders
      .filter(order =>
        order.item_ids.some(item => item.team_assignments?.caps?.length > 0)
      )
      .map(order => {
        const filteredItems = order.item_ids
          .filter(item => item.team_assignments?.caps?.length > 0)
          .map(item => {
            const capItems = item.team_assignments.caps;
            return {
              ...item,
              team_assignments: { caps: capItems }
            };
          });

        return {
          ...order,
          item_ids: filteredItems
        };
      });

    res.status(200).json({ success: true, data: filteredOrders });
  } catch (error) {
    console.error('Error fetching cap orders:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


import Order from "../models/Order.js";

export const getBoxOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate({
        path: 'item_ids',
        populate: {
          path: 'team_assignments.boxes',
          model: 'BoxItem'
        }
      })
      .lean();

    const filteredOrders = orders
      .filter(order =>
        order.item_ids.some(item => item.team_assignments?.boxes?.length > 0)
      )
      .map(order => {
        const filteredItems = order.item_ids
          .filter(item => item.team_assignments?.boxes?.length > 0)
          .map(item => {
            const boxItems = item.team_assignments.boxes;
            return {
              ...item,
              team_assignments: { boxes: boxItems }
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



// Route for QC status updates

import { updateGlassTracking } from "./glassController.js";

// Alternative: If you want a separate dedicated route
export const updateQc = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const { qc_status } = req.body;

    // Add to req.body for the existing function
    req.body.orderNumber = orderNumber;
    req.body.qc_status = qc_status;

    // Call the existing function
    await updateGlassTracking(req, res, next);
  } catch (error) {
    next(error);
  }
};
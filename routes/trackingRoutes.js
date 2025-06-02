import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();


const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing email credentials: EMAIL_USER or EMAIL_PASS not set');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },

    secure: true,
    debug: true,
    logger: true
  });
};

router.post('/send-tracking-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body;


    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, html'
      });
    }

    const transporter = createTransporter();
    if (!transporter) {
      return res.status(500).json({
        success: false,
        error: 'Email service not configured. Missing EMAIL_USER or EMAIL_PASS environment variables.'
      });
    }

    try {
      await transporter.verify();
    } catch (verifyError) {
      console.error('Transporter verification failed:', verifyError);
      return res.status(500).json({
        success: false,
        error: 'Email service connection failed. Please check credentials.'
      });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email'
    });
  }
});


router.post('/update', async (req, res) => {
  try {
    const trackingData = req.body;

    if (!trackingData.orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    const updatedTracking = await Tracking.findOneAndUpdate(
      { orderId: trackingData.orderId },
      {
        ...trackingData,
        lastUpdated: new Date()
      },
      {
        new: true,
        upsert: true, // Create if doesn't exist
        runValidators: true
      }
    );

    console.log('Tracking data updated for order:', trackingData.orderId);

    res.json({
      success: true,
      message: 'Tracking data updated successfully',
      data: updatedTracking
    });
  } catch (error) {
    console.error('Error updating tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update tracking data'
    });
  }
});

// GET route to retrieve tracking data by order ID
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const trackingData = await Tracking.findOne({
      $or: [
        { orderId: orderId },
        { order_number: orderId }
      ]
    });

    if (!trackingData) {
      return res.status(404).json({
        success: false,
        error: 'Tracking data not found for this order'
      });
    }

    res.json({
      success: true,
      data: trackingData
    });
  } catch (error) {
    console.error('Error fetching tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch tracking data'
    });
  }
});

// GET route to retrieve all tracking data (for admin)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = {};
    if (status) {
      query.orderStatus = status;
    }

    const trackingData = await Tracking.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Tracking.countDocuments(query);

    res.json({
      success: true,
      data: trackingData,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching all tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch tracking data'
    });
  }
});

// DELETE route to remove tracking data
router.delete('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const deletedTracking = await Tracking.findOneAndDelete({
      $or: [
        { orderId: orderId },
        { order_number: orderId }
      ]
    });

    if (!deletedTracking) {
      return res.status(404).json({
        success: false,
        error: 'Tracking data not found for this order'
      });
    }

    res.json({
      success: true,
      message: 'Tracking data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete tracking data'
    });
  }
});

export default router;
import nodemailer from 'nodemailer';
import Tracking from '../models/DeliveryTracking.js'; 

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

// GET /api/tracking - Get all tracking data with pagination
export const getAllTrackingData = async (req, res) => {
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
};

// GET /api/tracking/:orderId - Get tracking data by order ID
export const getTrackingById = async (req, res) => {
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
};

// POST /api/tracking - Create new tracking data
export const createTrackingData = async (req, res) => {
  try {
    const trackingData = req.body;

    if (!trackingData.orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    const newTracking = new Tracking({
      ...trackingData,
      lastUpdated: new Date()
    });

    const savedTracking = await newTracking.save();

    console.log('Tracking data created for order:', trackingData.orderId);

    res.status(201).json({
      success: true,
      message: 'Tracking data created successfully',
      data: savedTracking
    });
  } catch (error) {
    console.error('Error creating tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create tracking data'
    });
  }
};

// PUT /api/tracking/:orderId - Update tracking data
export const updateTrackingData = async (req, res) => {
  try {
    const { orderId } = req.params;
    const trackingData = req.body;

    const updatedTracking = await Tracking.findOneAndUpdate(
      { 
        $or: [
          { orderId: orderId },
          { order_number: orderId }
        ]
      },
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

    console.log('Tracking data updated for order:', orderId);

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
};

// DELETE /api/tracking/:orderId - Delete tracking data
export const deleteTrackingData = async (req, res) => {
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

    console.log('Tracking data deleted for order:', orderId);

    res.json({
      success: true,
      message: 'Tracking data deleted successfully',
      data: deletedTracking
    });
  } catch (error) {
    console.error('Error deleting tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete tracking data'
    });
  }
};

// POST /api/tracking/send-email - Send tracking email
export const sendTrackingEmail = async (req, res) => {
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
};
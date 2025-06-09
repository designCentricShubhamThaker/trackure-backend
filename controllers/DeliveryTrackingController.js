import nodemailer, { createTransport } from 'nodemailer';
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

// Enhanced update function with email notification
export const updateTrackingData = async (req, res) => {
  try {
    const { orderId } = req.params;
    const trackingData = req.body;

    // Get the previous tracking data to compare status
    const previousTracking = await Tracking.findOne({
      $or: [
        { orderId: orderId },
        { order_number: orderId }
      ]
    });

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
        upsert: true,
        runValidators: true
      }
    );

    console.log('Tracking data updated for order:', orderId);

    // Check if order status changed to 'Completed' or 'Delivered'
    const shouldSendEmail = (
      (!previousTracking || previousTracking.orderStatus !== 'Completed') &&
      (trackingData.orderStatus === 'Completed' || trackingData.currentStep === 6)
    ) || (
      (!previousTracking || previousTracking.orderStatus !== 'Delivered') &&
      trackingData.orderStatus === 'Delivered'
    );

    // Send email notification if order is completed/delivered
    if (shouldSendEmail && trackingData.customerEmail) {
      try {
        await sendDeliveryNotificationEmail(updatedTracking);
        console.log('Delivery notification email sent for order:', orderId);
      } catch (emailError) {
        console.error('Failed to send delivery notification email:', emailError);
        // Don't fail the update if email fails
      }
    }

    res.json({
      success: true,
      message: 'Tracking data updated successfully',
      data: updatedTracking,
      emailSent: shouldSendEmail && trackingData.customerEmail
    });
  } catch (error) {
    console.error('Error updating tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update tracking data'
    });
  }
};

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


export const updateTrackingWithEmail = async (req, res) => {
  try {
    const { orderId } = req.params;
    const trackingData = req.body;

    if (!trackingData.orderId && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    const finalOrderId = trackingData.orderId || orderId;

    // Update or create tracking data in database
    const updatedTracking = await Tracking.findOneAndUpdate(
      { 
        $or: [
          { orderId: finalOrderId },
          { order_number: finalOrderId }
        ]
      },
      {
        ...trackingData,
        orderId: finalOrderId,
        lastUpdated: new Date()
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    console.log('Tracking data updated/created for order:', finalOrderId);

    // Determine if we should send email based on status
    const shouldSendEmail = trackingData.sendEmail || 
      trackingData.orderStatus === 'Completed' || 
      trackingData.currentStep === 6 ||
      trackingData.orderStatus === 'Delivered';

    let emailSent = false;
    let emailError = null;

    // Send email if conditions are met
    if (shouldSendEmail && trackingData.customerEmail) {
      try {
        await sendTrackingUpdateEmail(updatedTracking);
        emailSent = true;
        console.log('Tracking update email sent for order:', finalOrderId);
      } catch (error) {
        emailError = error.message;
        console.error('Failed to send tracking email:', error);
      }
    }

    res.json({
      success: true,
      message: 'Tracking data updated successfully',
      data: updatedTracking,
      emailSent,
      emailError
    });
  } catch (error) {
    console.error('Error updating tracking with email:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update tracking data'
    });
  }
};

const sendDeliveryNotificationEmail = async (trackingData) => {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Email service not configured');
  }

  await transporter.verify();

  const trackingLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${trackingData.orderId}`;
  
  const isDelivered = trackingData.orderStatus === 'Completed' || trackingData.currentStep === 6;
  const subject = isDelivered ? 
    `🎉 Your Order #${trackingData.orderId} Has Been Delivered!` :
    `📦 Order Update - #${trackingData.orderId}`;

  const emailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa;">
      <div style="background: linear-gradient(135deg, #556b2f 0%, #4e9f3d 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">
          ${isDelivered ? '🎉 Order Delivered!' : '📦 Order Update'}
        </h1>
      </div>
      
      <div style="padding: 30px; background-color: white;">
        <h2 style="color: #556b2f; margin-bottom: 20px;">
          Hello ${trackingData.customerName}!
        </h2>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333;">
          ${isDelivered ? 
            'Great news! Your order has been successfully delivered.' :
            `Your order status has been updated to: <strong>${trackingData.stepTitle}</strong>`
          }
        </p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #556b2f; margin-top: 0;">Order Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Order Number:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${trackingData.orderId}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Status:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${trackingData.stepTitle}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Order Date:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${trackingData.orderDate}</td></tr>
            ${trackingData.estimatedDelivery ? `<tr><td style="padding: 8px 0;"><strong>Estimated Delivery:</strong></td><td style="padding: 8px 0;">${trackingData.estimatedDelivery}</td></tr>` : ''}
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingLink}" 
             style="background: linear-gradient(135deg, #556b2f 0%, #4e9f3d 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    display: inline-block;
                    font-weight: bold;
                    font-size: 16px;">
            Track Your Order
          </a>
        </div>

        ${isDelivered ? 
          '<p style="color: #556b2f; font-weight: bold; text-align: center;">Thank you for choosing us! We hope you love your order.</p>' :
          '<p style="color: #666;">We\'ll continue to keep you updated on your order\'s progress.</p>'
        }
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
        <p style="margin: 0; color: #666; font-size: 14px;">
          If you have any questions, please don't hesitate to contact our customer service team.
        </p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: trackingData.customerEmail,
    subject,
    html: emailHtml
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};


const sendTrackingUpdateEmail = async (trackingData) => {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Email service not configured');
  }

  await transporter.verify();

  const trackingLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${trackingData.orderId}`;
  
  const emailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #556b2f 0%, #4e9f3d 100%); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Order Tracking Update</h1>
      </div>
      
      <div style="padding: 30px; background-color: white;">
        <h2 style="color: #556b2f;">Hello ${trackingData.customerName}!</h2>
        <p>Your order #${trackingData.orderId} has been updated.</p>
        
        <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #556b2f; margin-top: 0;">Current Status: ${trackingData.stepTitle}</h3>
          <p style="margin: 0;">${trackingData.stepDescription}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingLink}" 
             style="background: linear-gradient(135deg, #556b2f 0%, #4e9f3d 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    display: inline-block;">
            Track Your Order
          </a>
        </div>
        
        <p>Thank you for your business!</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: trackingData.customerEmail,
    subject: `Order Update - #${trackingData.orderId}`,
    html: emailHtml
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};


export const sendTrackingEmail = async (req, res) => {
  try {
    const { to, subject, html, orderId } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, html'
      });
    }

    // ✅ Fixed: Use createTransporter() instead of createTransport()
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

    // If orderId is provided, create initial tracking data
    if (orderId) {
      try {
        const trackingData = {
          orderId,
          currentStep: 1,
          orderStatus: 'In Progress',
          stepTitle: 'Order Received',
          stepDescription: 'Order placed and confirmed',
          customerEmail: to,
          lastUpdated: new Date()
        };

        await Tracking.findOneAndUpdate(
          { orderId },
          trackingData,
          { upsert: true, new: true }
        );
      } catch (trackingError) {
        console.error('Error creating initial tracking data:', trackingError);
      }
    }

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
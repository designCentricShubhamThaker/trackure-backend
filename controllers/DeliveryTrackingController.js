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

// Get tracking data by ID
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

// Simplified update with email notification only on completion
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

    // Get existing tracking data to check if we need to send email
    const existingTracking = await Tracking.findOne({
      $or: [
        { orderId: finalOrderId },
        { order_number: finalOrderId }
      ]
    });

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

    // Send email only when order is completed (step 6) and email hasn't been sent before
    const isOrderCompleted = trackingData.currentStep === 6 || trackingData.orderStatus === 'Completed';
    const wasNotCompletedBefore = !existingTracking || existingTracking.currentStep < 6;
    const shouldSendEmail = isOrderCompleted && wasNotCompletedBefore && trackingData.customerEmail;

    let emailSent = false;
    let emailError = null;

    if (shouldSendEmail) {
      try {
        await sendCompletionEmail(updatedTracking);
        emailSent = true;
        console.log('Order completion email sent for order:', finalOrderId);
      } catch (error) {
        emailError = error.message;
        console.error('Failed to send completion email:', error);
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

// Send completion email when order reaches step 6
const sendCompletionEmail = async (trackingData) => {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Email service not configured');
  }

  await transporter.verify();

  // const trackingLink = `http://localhost:5173/track/${trackingData.orderId}`;
  const trackingLink = `https://trackure-doms.vercel.app/track/${trackingData.orderId}`;
  
  const emailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa;">
      <div style="background: linear-gradient(135deg, #556b2f 0%, #4e9f3d 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Order Completed!</h1>
      </div>
      
      <div style="padding: 30px; background-color: white;">
        <h2 style="color: #556b2f; margin-bottom: 20px;">Hello ${trackingData.customerName}!</h2>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333;">
          Great news! Your order has been successfully completed and is ready for delivery.
        </p>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #556b2f; margin-top: 0;">Order Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Order Number:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${trackingData.orderId}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Status:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Completed</td></tr>
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
            View Order Status
          </a>
        </div>

        <p style="color: #556b2f; font-weight: bold; text-align: center;">
          Thank you for choosing us! Your order will be delivered soon.
        </p>
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
    subject: `🎉 Your Order #${trackingData.orderId} is Complete!`,
    html: emailHtml
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};

// Send initial tracking email (called manually when needed)
export const sendTrackingEmail = async (req, res) => {
  try {
    const { to, subject, html, orderId } = req.body;

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
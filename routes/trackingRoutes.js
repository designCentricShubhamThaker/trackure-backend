import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

// Create transporter with better error handling
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing email credentials: EMAIL_USER or EMAIL_PASS not set');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail', // or use host/port for other services
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    // Add these for better security and debugging
    secure: true,
    debug: true,
    logger: true
  });

  // Alternative configuration for other email services:
  /*
  return nodemailer.createTransporter({
    host: 'smtp.your-email-provider.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  */
};

router.post('/send-tracking-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body;

    // Validate request body
    if (!to || !subject || !html) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: to, subject, html' 
      });
    }

    // Create transporter
    const transporter = createTransporter();
    if (!transporter) {
      return res.status(500).json({ 
        success: false, 
        error: 'Email service not configured. Missing EMAIL_USER or EMAIL_PASS environment variables.' 
      });
    }

    // Verify transporter connection
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

export default router;
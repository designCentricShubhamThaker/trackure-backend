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

export default router;
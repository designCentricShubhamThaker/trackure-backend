import express from 'express';
import {
  
  getTrackingById,
  updateTrackingWithEmail,
  sendTrackingEmail
} from '../controllers/DeliveryTrackingController.js';

const router = express.Router();


router.route('/:orderId')
  .get(getTrackingById)
  .put(updateTrackingWithEmail)


router.route('/update-with-email/:orderId')
  .put(updateTrackingWithEmail);


router.route('/send-tracking-email')
  .post(sendTrackingEmail);

export default router;
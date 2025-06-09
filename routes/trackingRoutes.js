import express from 'express';
import {
  getAllTrackingData,
  getTrackingById,
  createTrackingData,
  updateTrackingData,
  deleteTrackingData,
  updateTrackingWithEmail,
  sendTrackingEmail
} from '../controllers/DeliveryTrackingController.js';

const router = express.Router();


router.route('/')
  .get(getAllTrackingData)
  .post(createTrackingData);


router.route('/:orderId')
  .get(getTrackingById)
  .put(updateTrackingData)
  .delete(deleteTrackingData);


router.route('/update-with-email/:orderId')
  .put(updateTrackingWithEmail);


router.route('/send-tracking-email')
  .post(sendTrackingEmail);

export default router;
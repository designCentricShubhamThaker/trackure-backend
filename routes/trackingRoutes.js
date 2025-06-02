import express from 'express';
import {
  getAllTrackingData,
  getTrackingById,
  createTrackingData,
  updateTrackingData,
  deleteTrackingData,
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


router.route('/send-email')
  .post(sendTrackingEmail);

export default router;
import express from 'express';
import {
  getGlassOrders,
  updateGlassTracking,
} from '../controllers/glassController.js';

const router = express.Router();

router.route('/')
  .get(getGlassOrders)
  .patch(updateGlassTracking)


export default router;
import express from 'express';
import {
  getGlassOrders,
} from '../controllers/glassController.js';

const router = express.Router();

router.route('/')
  .get(getGlassOrders);


export default router;
import express from 'express';
import {
  getCapOrders,
 
} from '../controllers/capController.js';

const router = express.Router();

router.route('/')
  .get(getCapOrders);



export default router;
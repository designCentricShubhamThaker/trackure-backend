import express from 'express';
import {
getBoxOrders
} from '../controllers/boxController.js';

const router = express.Router();

router.route('/')
  .get(getBoxOrders);



export default router;
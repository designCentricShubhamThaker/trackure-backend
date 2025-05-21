import express from 'express';
import {
  getAllPumpItems,
  getPumpItemById,
  createPumpItem,
  updatePumpItem,
  updatePumpItemTracking,
  deletePumpItem
} from '../controllers/pumpController.js';

const router = express.Router();

router.route('/')
  .get(getAllPumpItems);

router.route('/:id')
  .get(getPumpItemById)
  .put(updatePumpItem)
  .delete(deletePumpItem);

router.route('/orderItem/:orderItem_id')
  .post(createPumpItem);

router.route('/:id/tracking')
  .put(updatePumpItemTracking);

export default router;
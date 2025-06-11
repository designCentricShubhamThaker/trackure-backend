
import express from 'express';
;
import { updateQc } from '../controllers/qcController.js';

const router = express.Router();

router.route('/')
  .patch(updateQc)
  


export default router;
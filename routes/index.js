import express from 'express';
import orderRoutes from './orderRoutes.js';
import glassRoutes from './glassRoutes.js';
import capRoutes from './capRoutes.js';
import boxRoutes from './boxRoutes.js';
import pumpRoutes from './pumpRoutes.js'; 
import authRoutes from './authRoutes.js'; 
import trackingRoutes from './trackingRoutes.js'; 
import qcRoutes from './qcRoutes.js'; 

const router = express.Router();


router.use('/orders', orderRoutes);
router.use('/glass', glassRoutes);
router.use('/caps', capRoutes);
router.use('/boxes', boxRoutes);
router.use('/pumps', pumpRoutes);
router.use('/auth', authRoutes);
router.use('/track' , trackingRoutes)
router.use('/qc' , qcRoutes)

export default router;
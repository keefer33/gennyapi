import express from 'express';
import { generate } from './generate';
import { calculateCost } from './calculateCost';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

router.post('/generate', authenticateUser, generate);
router.post('/calculate-cost', authenticateUser, calculateCost);
export default router;
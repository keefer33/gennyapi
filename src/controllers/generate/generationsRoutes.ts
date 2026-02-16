import express from 'express';
import { generate } from './generate';
import { calculateTokens } from './calculateTokens';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

router.post('/generate', authenticateUser, generate);
router.post('/calculate-tokens', authenticateUser, calculateTokens);
export default router;
import express from 'express';
import { generate } from './generate';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

// POST generate
router.post('/generate', authenticateUser, generate);
export default router;
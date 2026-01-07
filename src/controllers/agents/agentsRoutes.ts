import express from 'express';
import { enhancePrompt } from './enhancePrompt';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

// POST generate
router.post('/enhance/prompt', authenticateUser, enhancePrompt);
export default router;
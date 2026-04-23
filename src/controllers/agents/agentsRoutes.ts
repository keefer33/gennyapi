import express from 'express';
import { enhancePrompt } from './enhancePrompt';
import { authenticateUser } from '../../middlewares/auth';
import {
  getAgentModels,
} from './agentsEndpoints';
import { runAgent } from './runAgent';

const router = express.Router();

// Enhance prompt
router.post('/enhance/prompt', enhancePrompt);

// User agents CRUD
router.get('/', getAgentModels );
router.post('/run', authenticateUser, runAgent);

export default router;

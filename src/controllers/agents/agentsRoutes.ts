import express from 'express';
import { enhancePrompt } from './enhancePrompt';
import { authenticateUser } from '../../middlewares/auth';
import {
  getAgentModels,
  createUserAgent,
  listUserAgents,
  getUserAgent,
  updateUserAgent,
  deleteUserAgent,
} from './agentsEndpoints';
import { runAgent } from './runAgent';

const router = express.Router();

// Enhance prompt
router.post('/enhance/prompt', authenticateUser, enhancePrompt);

// User agents CRUD
router.get('/', getAgentModels );
router.post('/user-agents', authenticateUser, createUserAgent);
router.get('/user-agents', authenticateUser, listUserAgents);
router.get('/user-agents/:agent_id', authenticateUser, getUserAgent);
router.patch('/user-agents/:agent_id', authenticateUser, updateUserAgent);
router.delete('/user-agents/:agent_id', authenticateUser, deleteUserAgent);
router.post('/run', authenticateUser, runAgent);

export default router;

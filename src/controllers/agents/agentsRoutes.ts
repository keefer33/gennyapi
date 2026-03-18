import express from 'express';
import { enhancePrompt } from './enhancePrompt';
import { authenticateUser } from '../../middlewares/auth';
import { listAgentModels } from './listAgentModels';
import {
  createUserAgent,
  listUserAgents,
  getUserAgent,
  updateUserAgent,
  deleteUserAgent,
} from './userAgents';

const router = express.Router();

// Enhance prompt
router.post('/enhance/prompt', authenticateUser, enhancePrompt);

// Agent models
router.get('/agent-models', listAgentModels);

// User agents CRUD
router.post('/user-agents', authenticateUser, createUserAgent);
router.get('/user-agents', authenticateUser, listUserAgents);
router.get('/user-agents/:agent_id', authenticateUser, getUserAgent);
router.patch('/user-agents/:agent_id', authenticateUser, updateUserAgent);
router.delete('/user-agents/:agent_id', authenticateUser, deleteUserAgent);

export default router;

import express from 'express';
import { enhancePrompt } from './enhancePrompt';
import { authenticateUser } from '../../middlewares/auth';
import { aiGatewayPrompt } from './aiGatewayPrompt';
import { getAiGatewayModels } from './aiGatewayModels';
import { runAgent } from './runAgent';
import {
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  createConversationItems,
  listConversationItems,
  getConversationItem,
  deleteConversationItem,
} from './conversations';

const router = express.Router();

// POST generate
router.post('/enhance/prompt', authenticateUser, enhancePrompt);
router.post('/ai-gateway/prompt', authenticateUser, aiGatewayPrompt);
router.get('/aigateway/models', getAiGatewayModels);
router.post('/run', authenticateUser, runAgent);

// Conversations API endpoints
router.post('/conversations', authenticateUser, createConversation);
router.get('/conversations/:conversation_id', authenticateUser, getConversation);
router.post('/conversations/:conversation_id', authenticateUser, updateConversation);
router.delete('/conversations/:conversation_id', authenticateUser, deleteConversation);

// Conversation Items endpoints
router.post('/conversations/:conversation_id/items', authenticateUser, createConversationItems);
router.get('/conversations/:conversation_id/items', authenticateUser, listConversationItems);
router.get('/conversations/:conversation_id/items/:item_id', authenticateUser, getConversationItem);
router.delete('/conversations/:conversation_id/items/:item_id', authenticateUser, deleteConversationItem);

export default router;
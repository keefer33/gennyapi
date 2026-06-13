import express from 'express';
import { enhancePrompt } from './enhancePrompt';
import { authenticateUser } from '../../middlewares/auth';
import {
  getAgentModels,
} from './agentsEndpoints';
import { runAgent } from './runAgent';
import { transcribeChatAudioHandler } from './transcribeChatAudio';
import { visionDescribe } from './visionDescribe';

const router = express.Router();

// Enhance prompt
router.post('/enhance/prompt', enhancePrompt);

/** Public: describe a remote file via AI Gateway vision model */
router.post('/vision', visionDescribe);

// User agents CRUD
router.get('/', getAgentModels );
router.post('/run', authenticateUser, runAgent);
router.post('/transcribe', authenticateUser, transcribeChatAudioHandler);

export default router;

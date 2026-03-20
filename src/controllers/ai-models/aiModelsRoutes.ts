import express from 'express';
import { getAiModels, searchAiModels, runAiModel } from './aiModelsEndpoints';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

// Agent models
router.get('/', getAiModels );
router.post('/search', authenticateUser, searchAiModels);
router.post('/run', authenticateUser, runAiModel);

export default router;

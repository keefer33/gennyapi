import express from 'express';
import { playgroundModelsList } from './playgroundModelsList';
import { playgroundModelRun } from './playgroundModelRun';
import { playgroundModelRunsHistory } from './playgroundModelRunsHistory';
import { playgroundModelRunsHistoryModels } from './playgroundModelRunsHistoryModels';
import { playgroundRecentModels } from './playgroundRecentModels';
import { playgroundModelRunById } from './playgroundModelRunById';
import { playgroundModelRunDelete } from './playgroundModelRunDelete';
import { authenticateUser } from '../../middlewares/auth';
import { playgroundRunCost } from './playgroundRunCost';
import { webhookWavespeed } from '../../api-vendors/wavespeed/webhookWavespeed';
import { playgroundModelRunAgent } from './playgroundModelRunAgent';
const router = express.Router();

router.get('/runs/models', authenticateUser, playgroundModelRunsHistoryModels);
router.get('/runs/:runId', authenticateUser, playgroundModelRunById);
router.get('/runs/:runId/agent', authenticateUser, playgroundModelRunAgent);
router.get('/models/recent', authenticateUser, playgroundRecentModels);
router.delete('/runs/:runId', authenticateUser, playgroundModelRunDelete);
router.get('/runs', authenticateUser, playgroundModelRunsHistory);

// Index route for playground searchable model list.
router.get('/', playgroundModelsList);
router.post('/cost', authenticateUser, playgroundRunCost);
router.post('/run', authenticateUser, playgroundModelRun);
router.post('/webhooks/wavespeed', webhookWavespeed);

export default router;

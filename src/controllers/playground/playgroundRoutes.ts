import express from 'express';
import { playgroundModelsList } from './playgroundModelsList';
import { playgroundModelRun } from './playgroundModelRun';
import { playgroundModelRunsHistory } from './playgroundModelRunsHistory';
import { authenticateUser } from '../../middlewares/auth';
import { playgroundWebhookWavespeed } from './playgroundWebhookWavespeed';
import { playgroundRunCost } from './playgroundRunCost';

const router = express.Router();

router.get('/runs', authenticateUser, playgroundModelRunsHistory);

// Index route for playground searchable model list.
router.get('/', playgroundModelsList);
router.post('/cost', authenticateUser, playgroundRunCost);
router.post('/run', authenticateUser, playgroundModelRun);
router.post('/webhooks/wavespeed', playgroundWebhookWavespeed);

export default router;

import express from 'express';
import { listPlaygroundModels } from './listPlaygroundModels';
import { runPlaygroundModel } from './runPlaygroundModel';
import { authenticateUser } from '../../middlewares/auth';
import { playgroundWebhookWavespeed } from './playgroundWebhookWavespeed';

const router = express.Router();

// Index route for playground searchable model list.
router.get('/', listPlaygroundModels);
router.post('/run', authenticateUser, runPlaygroundModel);
router.post('/webhooks/wavespeed', playgroundWebhookWavespeed);

export default router;

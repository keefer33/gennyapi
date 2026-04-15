import express from 'express';
import { webhookWavespeed } from '../../api-vendors/wavespeed/webhookWavespeed';
import { webhookPolling } from './webhookPolling';

const router = express.Router();
// POST /webhooks routes
router.post('/wavespeed', webhookWavespeed);
router.post('/polling', webhookPolling);

export default router;
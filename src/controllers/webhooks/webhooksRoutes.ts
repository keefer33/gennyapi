import express from 'express';
import { webhooksPolling } from './webhooksPolling';
import { webhookWavespeed } from '../../api-vendors/wavespeed/webhookWavespeed';

const router = express.Router();
  // POST /webhooks/polling route
  router.post('/polling', webhooksPolling);
  router.post('/wavespeed', webhookWavespeed);

  export default router;
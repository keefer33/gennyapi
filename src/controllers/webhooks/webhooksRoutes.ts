import express from 'express';
import { webhookWavespeed } from '../../api-vendors/wavespeed/webhookWavespeed';

const router = express.Router();
  // POST /webhooks/polling route
  router.post('/wavespeed', webhookWavespeed);

  export default router;
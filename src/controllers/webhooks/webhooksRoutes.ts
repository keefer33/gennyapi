import express from 'express';
import { webhooksPolling } from './webhooksPolling';

const router = express.Router();
  // POST /webhooks/polling route
  router.post('/polling', webhooksPolling);

  export default router;
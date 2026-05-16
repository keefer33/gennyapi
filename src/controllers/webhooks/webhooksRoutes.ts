import express from 'express';
import { webhookWavespeed } from '../../api-vendors/wavespeed/webhookWavespeed';
import { webhookFileDelete } from './webhookFileDelete';
import { webhookPolling } from './webhookPolling';

const router = express.Router();
// POST /webhooks routes
router.post('/wavespeed', webhookWavespeed);
router.post('/polling', webhookPolling);
router.post('/file-delete', webhookFileDelete);

export default router;
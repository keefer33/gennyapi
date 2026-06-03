import express from 'express';
import { webhookWavespeed } from '../../api-vendors/wavespeed/webhookWavespeed';
import { webhookCharacterGenerateLook } from './webhookCharacterGenerateLook';
import { webhookFileDelete } from './webhookFileDelete';
import { webhookPolling } from './webhookPolling';

const router = express.Router();
// POST /webhooks routes
router.post('/wavespeed', webhookWavespeed);
router.post('/polling', webhookPolling);
router.post('/characters/generate/look', webhookCharacterGenerateLook);
router.post('/file-delete', webhookFileDelete);

export default router;
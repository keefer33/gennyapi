import express from 'express';
import { authenticateUser } from '../../../middlewares/auth';
import { getSharedVoices } from './getSharedVoices';

const router = express.Router();

router.get('/library', authenticateUser, getSharedVoices);

export default router;

import express from 'express';
import { authenticateUser } from '../../../middlewares/auth';
import { createCharacterSpeech } from './createCharacterSpeech';
import { getSharedVoices } from './getSharedVoices';

const router = express.Router();

router.get('/library', authenticateUser, getSharedVoices);
router.post('/speech', authenticateUser, createCharacterSpeech);

export default router;

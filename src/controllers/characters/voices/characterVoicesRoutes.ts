import express from 'express';
import { authenticateUser } from '../../../middlewares/auth';
import { createCharacterFromUserVoice } from './createCharacterFromUserVoice';
import { createCharacterSpeech } from './createCharacterSpeech';
import { createVoice } from './createVoice';
import { deleteUserVoice } from './deleteUserVoice';
import { getSharedVoices } from './getSharedVoices';
import { getUserVoices } from './getUserVoices';

const router = express.Router();

router.get('/', authenticateUser, getUserVoices);
router.get('/library', authenticateUser, getSharedVoices);
router.post('/create', authenticateUser, createVoice);
router.post('/:voiceId/character', authenticateUser, createCharacterFromUserVoice);
router.delete('/:voiceId', authenticateUser, deleteUserVoice);
router.post('/speech', authenticateUser, createCharacterSpeech);

export default router;

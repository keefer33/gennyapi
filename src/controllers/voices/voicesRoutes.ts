import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { assistSpeechScriptHandler } from './assistSpeechScript';
import { assistVoiceDesignHandler } from './assistVoiceDesign';
import { cloneVoice } from './cloneVoice';
import { deleteVoice } from './deleteVoice';
import { deleteVoiceSpeech } from './deleteVoiceSpeech';
import { updateVoiceSpeech } from './updateVoiceSpeech';
import { designVoice } from './designVoice';
import { getLibraryVoices } from './getLibraryVoices';
import { getSharedLibraryVoices } from './getSharedLibraryVoices';
import { getUserVoices } from './getUserVoices';
import { getVoice } from './getVoice';
import { getVoiceSpeeches } from './getVoiceSpeeches';
import { publishVoice } from './publishVoice';
import { synthesizeSpeech } from './synthesizeSpeech';
import { updateVoice } from './updateVoice';

const router = express.Router();

router.get('/', authenticateUser, getUserVoices);
router.get('/library', authenticateUser, getLibraryVoices);
router.get('/shared-library', authenticateUser, getSharedLibraryVoices);
router.get('/speech/:voiceId', authenticateUser, getVoiceSpeeches);
router.patch('/speech/entry/:speechId', authenticateUser, updateVoiceSpeech);
router.delete('/speech/entry/:speechId', authenticateUser, deleteVoiceSpeech);
router.get('/:voiceId', authenticateUser, getVoice);
router.post('/clone', authenticateUser, cloneVoice);
router.post('/design', authenticateUser, designVoice);
router.post('/design/assist', authenticateUser, assistVoiceDesignHandler);
router.post('/publish', authenticateUser, publishVoice);
router.post('/speech/assist', authenticateUser, assistSpeechScriptHandler);
router.post('/speech', authenticateUser, synthesizeSpeech);
router.patch('/:voiceId', authenticateUser, updateVoice);
router.delete('/:voiceId', authenticateUser, deleteVoice);

export default router;

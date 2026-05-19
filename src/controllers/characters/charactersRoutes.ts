import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { createCharacter } from './createCharacter';
import { createCharacterDialogue } from './voices/createCharacterDialogue';
import { createCharacterSpeech } from './voices/createCharacterSpeech';
import { deleteUserCharacter } from './deleteUserCharacter';
import { getSharedVoices } from './voices/getSharedVoices';
import { getUserCharacter } from './getUserCharacter';
import { getUserCharacters } from './getUserCharacters';
import { listCharacterAudioFiles } from './listCharacterAudioFiles';
import { patchUserCharacter } from './patchUserCharacter';
import { runCharacterGeneration } from './runCharacterGeneration';

const router = express.Router();

router.get('/', authenticateUser, getUserCharacters);
router.get('/library', authenticateUser, getSharedVoices);
router.post('/create', authenticateUser, createCharacter);
router.post('/speech', authenticateUser, createCharacterSpeech);
router.post('/dialogue', authenticateUser, createCharacterDialogue);
router.post('/:characterId/run', authenticateUser, runCharacterGeneration);
router.get('/:characterId/audio-files', authenticateUser, listCharacterAudioFiles);
router.patch('/:characterId', authenticateUser, patchUserCharacter);
router.delete('/:characterId', authenticateUser, deleteUserCharacter);
router.get('/:characterId', authenticateUser, getUserCharacter);

export default router;

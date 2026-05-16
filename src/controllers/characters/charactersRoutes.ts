import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { createCharacterFromVoice } from './createCharacterFromVoice';
import { deleteUserCharacter } from './deleteUserCharacter';
import { getUserCharacter } from './getUserCharacter';
import { getUserCharacters } from './getUserCharacters';
import { runCharacterGeneration } from './runCharacterGeneration';
import characterVoicesRoutes from './voices/characterVoicesRoutes';

const router = express.Router();

router.get('/', authenticateUser, getUserCharacters);
router.post('/create', authenticateUser, createCharacterFromVoice);
router.use('/voices', characterVoicesRoutes);
router.post('/:characterId/run', authenticateUser, runCharacterGeneration);
router.delete('/:characterId', authenticateUser, deleteUserCharacter);
router.get('/:characterId', authenticateUser, getUserCharacter);

export default router;

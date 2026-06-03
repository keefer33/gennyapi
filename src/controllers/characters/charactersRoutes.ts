import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { assistCharacterDesignHandler } from './assistCharacterDesign';
import { createUserCharacter } from './createUserCharacter';
import { deleteUserCharacter } from './deleteUserCharacter';
import { getUserCharacter } from './getUserCharacter';
import { getUserCharacters } from './getUserCharacters';
import { generateCharacterLook } from './generateCharacterLook';
import { getUserCharacterHistory } from './getUserCharacterHistory';
import { switchCharacterBaseLook } from './switchCharacterBaseLook';
import { updateUserCharacter } from './updateUserCharacter';
import { createCharacterKlingElement } from './createCharacterKlingElement';

const router = express.Router();

router.get('/', authenticateUser, getUserCharacters);
router.post('/assist', authenticateUser, assistCharacterDesignHandler);
router.post('/', authenticateUser, createUserCharacter);
router.post('/:characterId/generate-look', authenticateUser, generateCharacterLook);
router.post('/:characterId/create-element/kling', authenticateUser, createCharacterKlingElement);
router.post('/:characterId/switch-base-look', authenticateUser, switchCharacterBaseLook);
router.get('/:characterId/history', authenticateUser, getUserCharacterHistory);
router.get('/:characterId', authenticateUser, getUserCharacter);
router.patch('/:characterId', authenticateUser, updateUserCharacter);
router.delete('/:characterId', authenticateUser, deleteUserCharacter);

export default router;

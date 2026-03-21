import express from 'express';
import { generate } from './generate';
import { calculateCost } from './calculateCost';
import { authenticateUser } from '../../middlewares/auth';
import { getGenerationModels } from './generationsModels';
import { listUserGenerations } from './listUserGenerations';
import { getUserGeneration } from './getUserGeneration';
import { deleteUserGeneration } from './deleteUserGeneration';

const router = express.Router();

router.get('/models', getGenerationModels);
router.post('/generate', authenticateUser, generate);
router.post('/calculate-cost', authenticateUser, calculateCost);
router.get('/list', authenticateUser, listUserGenerations);
router.get('/:generationId', authenticateUser, getUserGeneration);
router.delete('/:generationId', authenticateUser, deleteUserGeneration);
export default router;
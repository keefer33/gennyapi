import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { createUser } from './createUser';

const router = express.Router();

// POST generate
router.post('/create-user', createUser);
//router.post('/generate', authenticateUser, generate);
export default router;
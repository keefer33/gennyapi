import express from 'express';
import { createUser } from './createUser';
import { createToken } from './createToken';

const router = express.Router();

// POST generate
router.post('/create-user', createUser);
router.post('/create-token', createToken);
//router.post('/generate', authenticateUser, generate);
export default router;
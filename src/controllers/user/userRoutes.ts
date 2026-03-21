import express from 'express';
import { createUser } from './createUser';
import { createToken } from './createToken';
import { getUserProfile } from './getUserProfile';
import { updateApiKey } from './updateApiKey';
import { listTransactions } from './listTransactions';
import { listUserUsageLog } from './listUserUsageLog';
import userFilesRoutes from './files/userFilesRoutes';
import userTagsRoutes from './tags/userTagsRoutes';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

router.get('/profile', getUserProfile);
router.post('/create-user', createUser);
router.post('/create-token', createToken);
router.post('/api-key', updateApiKey);
router.get('/transactions', authenticateUser, listTransactions);
router.get('/usage-log', authenticateUser, listUserUsageLog);
router.use('/files', userFilesRoutes);
router.use('/tags', userTagsRoutes);
//router.post('/generate', authenticateUser, generate);
export default router;
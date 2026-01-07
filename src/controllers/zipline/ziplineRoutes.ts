import express from 'express';
import { authRegister } from './authRegister';
import { upload } from './upload';
import { userFileDelete } from './userFileDelete';
import { userGet } from './userGet';
import { userUpdate } from './userUpdate';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

// POST generate
router.post('/auth/register', authRegister);
router.post('/upload', authenticateUser, upload);
router.post('/user/files/delete', authenticateUser, userFileDelete);
router.get('/user/get', authenticateUser, userGet);
router.patch('/user/update', authenticateUser, userUpdate);

export default router;
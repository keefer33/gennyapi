import express from 'express';
import { authenticateUser } from '../../../middlewares/auth';
import { listUserFiles } from './listUserFiles';
import { getUserFileByPath } from './getUserFileByPath';
import { getUserFileById } from './getUserFileById';
import { createUserFile } from './createUserFile';
import { deleteUserFile } from './deleteUserFile';
import { updateUserFile } from './updateUserFile';
import { uploadUserFile } from './uploadUserFile';

const router = express.Router();

router.get('/by-path', authenticateUser, getUserFileByPath);
router.get('/', authenticateUser, listUserFiles);
router.get('/:fileId', authenticateUser, getUserFileById);
router.post('/upload', authenticateUser, uploadUserFile);
router.post('/', authenticateUser, createUserFile);
router.delete('/:fileId', authenticateUser, deleteUserFile);
router.patch('/:fileId', authenticateUser, updateUserFile);

export default router;

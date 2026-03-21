import express from 'express';
import { authenticateUser } from '../../../middlewares/auth';
import { listUserTags } from './listUserTags';
import { createUserTag } from './createUserTag';
import { updateUserTag } from './updateUserTag';
import { deleteUserTag } from './deleteUserTag';
import { getFileTags } from './getFileTags';
import { addTagToFile } from './addTagToFile';
import { removeTagFromFile } from './removeTagFromFile';

const router = express.Router();

router.get('/files/:fileId', authenticateUser, getFileTags);
router.post('/file-links', authenticateUser, addTagToFile);
router.delete('/file-links', authenticateUser, removeTagFromFile);
router.get('/', authenticateUser, listUserTags);
router.post('/', authenticateUser, createUserTag);
router.patch('/:tagId', authenticateUser, updateUserTag);
router.delete('/:tagId', authenticateUser, deleteUserTag);

export default router;

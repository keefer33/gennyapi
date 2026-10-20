import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { createUserProject } from './createUserProject';
import { deleteUserProject } from './deleteUserProject';
import { getUserProject } from './getUserProject';
import { getUserProjects } from './getUserProjects';
import { updateUserProject } from './updateUserProject';

const router = express.Router();

router.get('/', authenticateUser, getUserProjects);
router.post('/', authenticateUser, createUserProject);
router.get('/:projectId', authenticateUser, getUserProject);
router.patch('/:projectId', authenticateUser, updateUserProject);
router.delete('/:projectId', authenticateUser, deleteUserProject);

export default router;

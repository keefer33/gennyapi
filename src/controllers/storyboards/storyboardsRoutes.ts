import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { createUserStoryboard } from './createUserStoryboard';
import { createUserStoryboardRenderHandler } from './createUserStoryboardRender';
import { createUserStoryboardScene } from './createUserStoryboardScene';
import { deleteUserStoryboard } from './deleteUserStoryboard';
import { deleteUserStoryboardRender } from './deleteUserStoryboardRender';
import { deleteUserStoryboardScene } from './deleteUserStoryboardScene';
import { getUserStoryboard } from './getUserStoryboard';
import { getUserStoryboardRenders } from './getUserStoryboardRenders';
import { getUserStoryboardScene } from './getUserStoryboardScene';
import { getUserStoryboardScenes } from './getUserStoryboardScenes';
import { getUserStoryboards } from './getUserStoryboards';
import { updateUserStoryboard } from './updateUserStoryboard';
import { updateUserStoryboardScene } from './updateUserStoryboardScene';

const router = express.Router();

router.get('/', authenticateUser, getUserStoryboards);
router.post('/', authenticateUser, createUserStoryboard);
router.get('/:storyboardId/renders', authenticateUser, getUserStoryboardRenders);
router.post('/:storyboardId/renders', authenticateUser, createUserStoryboardRenderHandler);
router.delete('/:storyboardId/renders/:renderId', authenticateUser, deleteUserStoryboardRender);
router.get('/:storyboardId/scenes', authenticateUser, getUserStoryboardScenes);
router.post('/:storyboardId/scenes', authenticateUser, createUserStoryboardScene);
router.get('/:storyboardId/scenes/:sceneId', authenticateUser, getUserStoryboardScene);
router.patch('/:storyboardId/scenes/:sceneId', authenticateUser, updateUserStoryboardScene);
router.delete('/:storyboardId/scenes/:sceneId', authenticateUser, deleteUserStoryboardScene);
router.get('/:storyboardId', authenticateUser, getUserStoryboard);
router.patch('/:storyboardId', authenticateUser, updateUserStoryboard);
router.delete('/:storyboardId', authenticateUser, deleteUserStoryboard);

export default router;

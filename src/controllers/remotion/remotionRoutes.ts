import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { render } from './render';

const router = express.Router();

router.post('/render', authenticateUser, render);

export default router;

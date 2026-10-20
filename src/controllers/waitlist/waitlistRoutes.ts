import express from 'express';
import { joinWaitlist } from './joinWaitlist';

const router = express.Router();

router.post('/', joinWaitlist);

export default router;

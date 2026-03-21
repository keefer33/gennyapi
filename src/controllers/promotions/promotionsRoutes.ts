import express from 'express';
import { listActivePromotions } from './listActivePromotions';

const router = express.Router();

router.get('/', listActivePromotions);

export default router;

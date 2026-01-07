import express, { NextFunction, Request, Response } from 'express';
import stripeRoutes from './controllers/stripe/stripeRoutes';
import  webhooksRoutes from './controllers/webhooks/webhooksRoutes';
import  generationsRoutes from './controllers/generate/generationsRoutes';
import  ziplineRoutes from './controllers/zipline/ziplineRoutes';
import  agentsRoutes from './controllers/agents/agentsRoutes';
import userRoutes from './controllers/user/userRoutes';
const router = express.Router();

// Route definitions
router.use('/stripe', stripeRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/generations', generationsRoutes);
router.use('/zipline', ziplineRoutes);
router.use('/agents', agentsRoutes);
router.use('/user', userRoutes);

// Health check route
router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString()
    });
  });

export default router;

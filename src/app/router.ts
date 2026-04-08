import express, { Request, Response } from 'express';
import stripeRoutes from '../controllers/stripe/stripeRoutes';
import webhooksRoutes from '../controllers/webhooks/webhooksRoutes';
import generationsRoutes from '../controllers/generate/generationsRoutes';
import ziplineRoutes from '../controllers/zipline/ziplineRoutes';
import agentsRoutes from '../controllers/agents/agentsRoutes';
import userRoutes from '../controllers/user/userRoutes';
import chatsRoutes from '../controllers/chats/chatRoutes';
import toolsRoutes from '../controllers/tools/toolsRoutes';
import brandsRoutes from '../controllers/brands/brandsRoutes';
import promotionsRoutes from '../controllers/promotions/promotionsRoutes';
import supportRoutes from '../controllers/support/supportRoutes';
import playgroundRoutes from '../controllers/playground/playgroundRoutes';
import { sendOk } from './response';

export function createAppRouter() {
  const router = express.Router();

  router.use('/stripe', stripeRoutes);
  router.use('/webhooks', webhooksRoutes);
  router.use('/generations', generationsRoutes);
  router.use('/zipline', ziplineRoutes);
  router.use('/agents', agentsRoutes);
  router.use('/user', userRoutes);
  router.use('/chats', chatsRoutes);
  router.use('/tools', toolsRoutes);
  router.use('/brands', brandsRoutes);
  router.use('/promotions', promotionsRoutes);
  router.use('/support', supportRoutes);
  router.use('/playground', playgroundRoutes);

  router.get('/health', (_req: Request, res: Response) => {
    sendOk(res, {
      status: 'OK',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

const appRouter = createAppRouter();
export default appRouter;

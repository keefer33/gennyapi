import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import appRouter from './app/router';
import { AppError } from './app/error';
import { notFound, sendError } from './app/response';

const app = express();
const PORT = process.env.PORT || 3000;

/** Voice publish sends base64 preview audio in JSON; default 100kb is too small. */
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '15mb';

// Middleware
app.use(cors());

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`🚀 Main app request: ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

// Mount the routes
app.use('/', appRouter);

// Not-found handler (for routes not matched above)
app.use((req: Request, res: Response) => {
  sendError(res, notFound(`Route ${req.originalUrl} not found`));
});

// Centralized error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.too.large') {
    sendError(
      res,
      new AppError('Request body too large', {
        statusCode: 413,
        code: 'payload_too_large',
        expose: true,
      })
    );
    return;
  }
  sendError(res, err);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;

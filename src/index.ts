import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import appRouter from './app/router';
import { notFound, sendError } from './app/response';

// Load environment variables from .env file
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`🚀 Main app request: ${req.method} ${req.originalUrl}`);
  next();
});

// Mount the routes
app.use('/', appRouter);

// Not-found handler (for routes not matched above)
app.use((req: Request, res: Response) => {
  sendError(res, notFound(`Route ${req.originalUrl} not found`));
});

// Centralized error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  sendError(res, err);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;

import { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { describeFileFromUrl } from '../../shared/describeFileVision';

/**
 * POST /agents/vision — public. Body: `{ file_url: string }` or `{ url: string }`.
 */
export async function visionDescribe(req: Request, res: Response): Promise<void> {
  try {
    const raw = req.body?.file_url ?? req.body?.url;
    const fileUrl = typeof raw === 'string' ? raw : '';
    const { text } = await describeFileFromUrl(fileUrl);
    sendOk(res, { text });
  } catch (error: unknown) {
    sendError(res, error);
  }
}

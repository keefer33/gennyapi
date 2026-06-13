import type { Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import {
  CHAT_TRANSCRIBE_MAX_BYTES,
  transcribeChatAudio,
} from '../../shared/transcribeChatAudio';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_TRANSCRIBE_MAX_BYTES },
});

/**
 * POST /agents/transcribe
 * Multipart field "audio" — transcribes short dictation clips for chat composer voice input.
 */
export async function transcribeChatAudioHandler(req: Request, res: Response): Promise<void> {
  try {
    getAuthUserId(req);

    await new Promise<void>((resolve, reject) => {
      uploadMiddleware.single('audio')(req, res, (err) => {
        if (err) {
          reject(
            new AppError('Audio upload error', {
              statusCode: 400,
              code: 'chat_transcribe_parse_failed',
              details: err instanceof Error ? err.message : err,
              expose: true,
            })
          );
          return;
        }
        resolve();
      });
    });

    const file = req.file;
    if (!file) {
      throw new AppError('No audio file provided', {
        statusCode: 400,
        code: 'chat_transcribe_missing_audio',
        expose: true,
      });
    }

    const text = await transcribeChatAudio(file.buffer, file.mimetype, file.originalname);
    sendOk(res, { text });
  } catch (error) {
    sendError(res, error);
  }
}

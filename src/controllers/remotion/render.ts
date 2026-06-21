import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { Request, Response } from 'express';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { saveRemotionRenderFile } from './saveRemotionRenderFile';

const REMOTION_SERVE_URL = process.env.REMOTION_SERVE_URL ?? 'http://rb.genny.bot/';
const REMOTION_COMPOSITION_ID = process.env.REMOTION_COMPOSITION_ID ?? 'MyComp';

export const render = async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);
  const tempDir = await mkdtemp(join(tmpdir(), 'remotion-render-'));
  const outputFilename = `${REMOTION_COMPOSITION_ID}.mp4`;
  const outputPath = join(tempDir, outputFilename);

  try {
    const composition = await selectComposition({
      serveUrl: REMOTION_SERVE_URL,
      id: REMOTION_COMPOSITION_ID,
    });

    console.log('[remotion/render] Starting composition render');

    await renderMedia({
      codec: 'h264',
      composition,
      serveUrl: REMOTION_SERVE_URL,
      outputLocation: outputPath,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
    });

    const fileBuffer = await readFile(outputPath);
    const fileRow = await saveRemotionRenderFile(
      userId,
      fileBuffer,
      outputFilename,
      composition.id
    );

    sendOk(res, {
      file_id: fileRow.id,
      file_url: fileRow.file_path,
      file_name: fileRow.file_name,
    });
  } catch (error) {
    sendError(res, error);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

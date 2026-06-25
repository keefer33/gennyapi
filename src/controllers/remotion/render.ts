import { mkdtemp, readFile, rm } from 'fs/promises';

import { join } from 'path';

import { tmpdir } from 'os';

import { Request, Response } from 'express';

import { renderMedia, selectComposition } from '@remotion/renderer';

import { AppError } from '../../app/error';

import { sendError, sendOk } from '../../app/response';

import { getAuthUserId } from '../../shared/getAuthUserId';

import { buildStoryboardRenderInputProps } from './buildStoryboardRenderInputProps';

import { saveRemotionRenderFile } from './saveRemotionRenderFile';

const REMOTION_SERVE_URL = process.env.REMOTION_SERVE_URL ?? 'http://rb.genny.bot/';

const REMOTION_COMPOSITION_ID = process.env.REMOTION_COMPOSITION_ID ?? 'MyComp';

export const render = async (req: Request, res: Response): Promise<void> => {
  const userId = getAuthUserId(req);

  const storyboardId = String(req.body?.storyboardId ?? '').trim();

  if (!storyboardId) {
    sendError(
      res,

      new AppError('storyboardId is required', {
        statusCode: 400,

        code: 'storyboard_id_required',

        expose: true,
      })
    );

    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'remotion-render-'));

  const outputFilename = `storyboard-${storyboardId}.mp4`;

  const outputPath = join(tempDir, outputFilename);

  try {
    const inputProps = await buildStoryboardRenderInputProps(userId, storyboardId);

    const composition = await selectComposition({
      serveUrl: REMOTION_SERVE_URL,

      id: REMOTION_COMPOSITION_ID,

      inputProps,
    });

    console.log('[remotion/render] Starting storyboard render', {
      storyboardId,

      durationInFrames: inputProps.durationInFrames,

      sceneCount: inputProps.scenes.length,
    });

    await renderMedia({
      codec: 'h264',

      composition,

      serveUrl: REMOTION_SERVE_URL,

      outputLocation: outputPath,

      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },

      inputProps,
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

      storyboard_id: storyboardId,
    });
  } catch (error) {
    sendError(res, error);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

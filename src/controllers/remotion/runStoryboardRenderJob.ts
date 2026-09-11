import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { getUserStoryboardForUser } from '../../database/user_storyboards';
import {
  getUserStoryboardRenderById,
  updateUserStoryboardRender,
} from '../../database/user_storyboards_renders';
import { buildStoryboardRenderInputProps } from './buildStoryboardRenderInputProps';
import { resolveRemotionServeUrl } from './resolveRemotionServeUrl';
import { saveRemotionRenderFile } from './saveRemotionRenderFile';

const REMOTION_COMPOSITION_ID = process.env.REMOTION_COMPOSITION_ID ?? 'MyComp';

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

export async function runStoryboardRenderJob(userId: string, renderId: string): Promise<void> {
  const uid = userId.trim();
  const rid = renderId.trim();
  if (!uid || !rid) {
    throw new Error('userId and renderId are required');
  }

  const render = await getUserStoryboardRenderById(rid);
  if (!render?.id?.trim() || !render.storyboard_id?.trim()) {
    throw new Error(`Storyboard render not found: ${rid}`);
  }

  const storyboardId = render.storyboard_id.trim();
  const storyboard = await getUserStoryboardForUser(uid, storyboardId);
  if (!storyboard?.id) {
    throw new Error(`Storyboard not found for render ${rid}`);
  }

  const metadata = asMetadataRecord(render.metadata);
  const tempDir = await mkdtemp(join(tmpdir(), 'remotion-render-'));
  const outputFilename = `storyboard-${storyboardId}.mp4`;
  const outputPath = join(tempDir, outputFilename);

  try {
    const serveUrl = resolveRemotionServeUrl();
    const inputProps = await buildStoryboardRenderInputProps(uid, storyboardId);

    const composition = await selectComposition({
      serveUrl,
      id: REMOTION_COMPOSITION_ID,
      inputProps,
    });

    const startedMetadata = {
      ...metadata,
      user_id: uid,
      storyboard_id: storyboardId,
      durationInFrames: inputProps.durationInFrames,
      sceneCount: inputProps.scenes.length,
      compositionId: composition.id,
    };

    await updateUserStoryboardRender(render.id, {
      status: 'processing',
      metadata: startedMetadata,
    });

    console.log('[storyboard/render] Starting Remotion job', {
      renderId: render.id,
      storyboardId,
      durationInFrames: inputProps.durationInFrames,
      sceneCount: inputProps.scenes.length,
    });

    await renderMedia({
      codec: 'h264',
      composition,
      serveUrl,
      outputLocation: outputPath,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
      inputProps,
    });

    const fileBuffer = await readFile(outputPath);
    const fileRow = await saveRemotionRenderFile(uid, fileBuffer, outputFilename, composition.id, {
      storyboardId,
      renderId: render.id,
    });

    await updateUserStoryboardRender(render.id, {
      status: 'completed',
      file_id: fileRow.id ?? null,
      metadata: {
        ...startedMetadata,
        file_name: fileRow.file_name ?? outputFilename,
        file_id: fileRow.id ?? null,
      },
    });

    console.log('[storyboard/render] completed', {
      renderId: render.id,
      file_id: fileRow.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[storyboard/render] failed', { renderId: render.id, message, error });

    await updateUserStoryboardRender(render.id, {
      status: 'error',
      metadata: {
        ...metadata,
        user_id: uid,
        storyboard_id: storyboardId,
        message,
        at: new Date().toISOString(),
      },
    }).catch((updateErr) => {
      console.error('[storyboard/render] failed to persist error status', updateErr);
    });

    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

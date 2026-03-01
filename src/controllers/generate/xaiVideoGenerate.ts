import { createXai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import {
  getUserGeneration,
  updateUserGeneration,
  createUserGenerationFile,
} from '../../utils/getSupaData';
import { saveFileFromBuffer } from '../../utils/generate';

const POLL_TIMEOUT_MS = 600000; // 10 minutes (docs recommend at least 10 min)

/** Standard resolution format for generateVideo; xAI maps 1280x720→720p, 854x480→480p. */
const resolution = (r: unknown): '1280x720' | '854x480' =>
  r === '720p' ? '1280x720' : '854x480';

/**
 * xAI video generation via AI SDK (grok-imagine-video).
 * Supports text-to-video, image-to-video, and video editing.
 * Runs in background: call generateVideo, save result to Zipline, update generation.
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/xai#text-to-video
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-video
 */
export const xaiVideoGenerate = async (
  generationId: string,
  taskObject: any
): Promise<void> => {
  try {
    const pollingFileData = await getUserGeneration(generationId);
    const payload = taskObject.payload || {};
    const apiKey =
      taskObject.api?.key?.key ?? process.env.XAI_API_KEY;
    if (!apiKey) {
      await updateUserGeneration({
        id: generationId,
        status: 'error',
        polling_response: { error: 'xAI API key not configured' },
      });
      return;
    }

    const xai = createXai({ apiKey });

    const providerOptions = {
      xai: {
        pollTimeoutMs: POLL_TIMEOUT_MS,
        ...(payload.video_url && { videoUrl: payload.video_url as string }),
      },
    };

    let prompt: string | { image: string; text?: string };
    if (payload.image && typeof payload.image === 'string') {
      prompt = {
        image: payload.image,
        text: typeof payload.prompt === 'string' ? payload.prompt : undefined,
      };
    } else {
      prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    }

    const aspectRatio = (payload.aspect_ratio as string) || '16:9';
    const result = await generateVideo({
      model: xai.video('grok-imagine-video'),
      prompt,
      aspectRatio: aspectRatio as `${number}:${number}`,
      duration:
        typeof payload.duration === 'number' && payload.duration >= 1 && payload.duration <= 15
          ? payload.duration
          : 5,
      resolution: resolution(payload.resolution),
      providerOptions: providerOptions as any,
    });

    const firstVideo = result.videos?.[0];
    if (!firstVideo) {
      await updateUserGeneration({
        id: generationId,
        status: 'error',
        polling_response: { error: 'No video in response' },
      });
      return;
    }

    const buffer = Buffer.from(
      firstVideo.uint8Array ?? Buffer.from(firstVideo.base64 ?? '', 'base64')
    );
    const savedFile = await saveFileFromBuffer(
      buffer,
      'generated.mp4',
      pollingFileData,
      { source: 'xai' }
    );

    await createUserGenerationFile({
      generation_id: generationId,
      file_id: savedFile.file_id,
    });

    await updateUserGeneration({
      id: generationId,
      status: 'completed',
      polling_response: { file_url: savedFile.file_url },
    });
  } catch (error: any) {
    console.error('xaiVideoGenerate error:', error?.message ?? error);
    await updateUserGeneration({
      id: generationId,
      status: 'error',
      polling_response: {
        error: error?.message ?? 'xAI video generation failed',
        stack: error?.stack,
      },
    }).catch((updateErr) =>
      console.error('Failed to update generation status:', updateErr)
    );
  }
};

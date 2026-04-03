import { createGateway, experimental_generateVideo as generateVideo } from 'ai';
import { getUserGeneration, updateUserGeneration, createUserGenerationFile } from './generateData';
import { saveFileFromBuffer } from './generateUtils';

/** Optional extended-timeout fetch for long-running video (requires optional dependency `undici`). */
function createGatewayWithOptionalExtendedTimeout(apiKey: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Agent } = require('undici') as {
      Agent: new (opts: { headersTimeout: number; bodyTimeout: number }) => unknown;
    };
    const agent = new Agent({
      headersTimeout: 15 * 60 * 1000,
      bodyTimeout: 15 * 60 * 1000,
    });
    return createGateway({
      apiKey,
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          dispatcher: agent,
        } as RequestInit & { dispatcher?: unknown }),
    });
  } catch {
    return createGateway({ apiKey });
  }
}

/** xAI video model id when using AI Gateway (creator/model-name). */
const XAI_VIDEO_MODEL_ID = 'xai/grok-imagine-video';

/** Standard resolution format for generateVideo; xAI maps 1280x720→720p, 854x480→480p. */
const resolution = (r: unknown): '1280x720' | '854x480' => (r === '720p' ? '1280x720' : '854x480');

export const xaiVideoGenerate = async (generationId: string, taskObject: any): Promise<void> => {
  try {
    console.log('[xaiVideoGenerate] start', { generationId, payloadKeys: Object.keys(taskObject.payload || {}) });

    const pollingFileData = await getUserGeneration(generationId);
    const payload = taskObject.payload || {};

    const gatewayApiKey = taskObject.api?.key?.key ?? process.env.AI_GATEWAY_API_KEY;
    if (!gatewayApiKey) {
      await updateUserGeneration({
        id: generationId,
        status: 'error',
        polling_response: {
          error: 'AI Gateway API key not configured (AI_GATEWAY_API_KEY or model API key)',
        },
      });
      return;
    }

    const gateway = createGatewayWithOptionalExtendedTimeout(gatewayApiKey);

    const providerOptions: Record<string, unknown> = {
      xai: {
        pollTimeoutMs: 300000,
        ...(payload.video && { videoUrl: payload.video as string }),
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

    const aspectRatio = (payload.aspectRatio ?? '16:9') as string;
    const duration =
      typeof payload.duration === 'number' && payload.duration >= 1 && payload.duration <= 15 ? payload.duration : 5;
    const resolutionVal = resolution(payload.resolution);

    const result = await generateVideo({
      model: gateway.video(XAI_VIDEO_MODEL_ID as any),
      prompt,
      aspectRatio: aspectRatio as `${number}:${number}`,
      duration,
      resolution: resolutionVal,
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

    const buffer = Buffer.from(firstVideo.uint8Array ?? Buffer.from(firstVideo.base64 ?? '', 'base64'));
    const savedFile = await saveFileFromBuffer(buffer, 'generated.mp4', pollingFileData, { source: 'xai' });

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
    const message = error?.message ?? 'xAI video generation failed';
    console.error('[xaiVideoGenerate] error', { generationId, message });
    await updateUserGeneration({
      id: generationId,
      status: 'error',
      polling_response: {
        error: typeof message === 'string' ? message : 'xAI video generation failed',
        stack: error?.stack,
      },
    });
  }
};

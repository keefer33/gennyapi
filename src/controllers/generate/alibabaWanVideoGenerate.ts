import { createGateway, experimental_generateVideo as generateVideo } from 'ai';
import { getUserGeneration, updateUserGeneration, createUserGenerationFile } from '../../utils/getSupaData';
import { saveFileFromBuffer, normalizeAspectRatio, toWanResolution } from '../../utils/generate';

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

/** Map payload model_name to AI Gateway video model id (e.g. wan2.6-t2v -> alibaba/wan-v2.6-t2v). */
function toGatewayModelId(modelName: string): string {
  const normalized = String(modelName ?? 'wan2.6-t2v')
    .trim()
    .toLowerCase();
  if (normalized === 'wan2.6-t2v' || normalized === 'wan2.6-i2v' || normalized === 'wan2.6-r2v') {
    return `alibaba/wan-v2.6-${normalized.replace('wan2.6-', '')}`;
  }
  return 'alibaba/wan-v2.6-t2v';
}

export const alibabaWanVideoGenerate = async (generationId: string, taskObject: any): Promise<void> => {
  try {
    const payload = taskObject.payload || {};
    const modelName = payload.model_name ?? 'wan2.6-t2v';
    const pollingFileData = await getUserGeneration(generationId);

    const resolutionVal = toWanResolution(payload.resolution, payload.aspectRatio);
    const aspectRatioVal = normalizeAspectRatio(payload.aspectRatio) as `${number}:${number}`;
    const duration =
      typeof payload.duration === 'number' && payload.duration >= 2 && payload.duration <= 15 ? payload.duration : 5;

    const providerOptions: Record<string, unknown> = {
      alibaba: {
        pollTimeoutMs: 600000,
        promptExtend: payload.promptExtend ?? false,
        shotType: payload.shotType,
        audioUrl: payload.audioUrl,
        audio: payload.audio,
      },
    };

    let prompt: string | { image: string; text?: string };

    switch (modelName) {
      case 'wan2.6-t2v':
        prompt = payload.prompt;
        break;
      case 'wan2.6-i2v':
        prompt = { image: payload.image, text: payload.prompt };
        break;
      case 'wan2.6-r2v':
        prompt = payload.prompt;
        if (payload.referenceUrls && Array.isArray(payload.referenceUrls)) {
          (providerOptions.alibaba as Record<string, unknown>).referenceUrls = payload.referenceUrls;
        }
        break;
      default:
        throw new Error(`Unsupported model name: ${modelName}`);
    }

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
    const gatewayModelId = toGatewayModelId(modelName);

    const result = await generateVideo({
      model: gateway.video(gatewayModelId as any),
      prompt,
      duration,
      resolution: resolutionVal as any,
      aspectRatio: aspectRatioVal,
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
    const savedFile = await saveFileFromBuffer(buffer, 'generated.mp4', pollingFileData, { source: 'alibaba-wan' });

    await createUserGenerationFile({
      generation_id: generationId,
      file_id: savedFile.file_id,
    });

    console.log('[alibabaWanVideoGenerate] completed', {
      generationId,
      file_url: savedFile.file_url,
    });
    await updateUserGeneration({
      id: generationId,
      status: 'completed',
      polling_response: { file_url: savedFile.file_url },
    });
  } catch (error: any) {
    const message = error?.message ?? error?.response?.data?.error?.message ?? 'Alibaba Wan video generation failed';
    console.error('[alibabaWanVideoGenerate] error', {
      generationId,
      message,
      statusCode: error?.response?.status,
    });
    await updateUserGeneration({
      id: generationId,
      status: 'error',
      polling_response: {
        error: typeof message === 'string' ? message : 'Alibaba Wan video generation failed',
        stack: error?.stack,
      },
    });
  }
};

import { createGateway, experimental_generateVideo as generateVideo } from 'ai';
import {
  getUserGeneration,
  updateUserGeneration,
  createUserGenerationFile,
} from '../../utils/getSupaData';
import { saveFileFromBuffer } from '../../utils/generate';

/** Allowed Wan model names; gateway uses alibaba/wan-v2.6-* slugs. */
const WAN_MODELS = new Set(['wan2.6-t2v', 'wan2.6-i2v', 'wan2.6-r2v']);

function toGatewayModelId(modelName: string): string {
  const normalized = modelName.trim().toLowerCase();
  if (!WAN_MODELS.has(normalized)) {
    return 'alibaba/wan-v2.6-t2v';
  }
  return `alibaba/wan-v${normalized.slice(3)}`;
}

/** 720P: resolution string by aspect ratio. */
const RES_720: Record<string, string> = {
  '16:9': '1280x720',
  '9:16': '720x1280',
  '1:1': '960x960',
  '4:3': '1088x832',
  '3:4': '832x1088',
};
/** 1080P: resolution string by aspect ratio. */
const RES_1080: Record<string, string> = {
  '16:9': '1920x1080',
  '9:16': '1080x1920',
  '1:1': '1440x1440',
  '4:3': '1632x1248',
  '3:4': '1248x1632',
};

function normalizeAspectRatio(ar: unknown): string {
  if (typeof ar !== 'string' || !ar) return '16:9';
  const t = ar.trim().replace(/\s/g, '').toLowerCase();
  if (t === '16:9' || t === '9:16' || t === '1:1' || t === '4:3' || t === '3:4') return t;
  if (t === '16/9') return '16:9';
  if (t === '9/16') return '9:16';
  return '16:9';
}

/** Map payload resolution (720p | 1080p) + aspectRatio to Wan resolution string (e.g. 1280x720). */
function toWanResolution(resolution: unknown, aspectRatio: unknown): string {
  const tier = String(resolution ?? '720p').trim().toLowerCase();
  const ar = normalizeAspectRatio(aspectRatio);
  const map = tier === '1080p' ? RES_1080 : RES_720;
  return map[ar] ?? map['16:9'];
}

export const alibabaWanVideoGenerate = async (
  generationId: string,
  taskObject: any
): Promise<void> => {
  try {
    const payload = taskObject.payload || {};
    const modelName = payload.model_name ?? 'wan2.6-t2v';

    console.log('[alibabaWanVideoGenerate] start', {
      generationId,
      model_name: modelName,
      payloadKeys: Object.keys(payload),
    });

    const pollingFileData = await getUserGeneration(generationId);

    const gatewayApiKey =
      taskObject.api?.key?.key ?? process.env.AI_GATEWAY_API_KEY;
    if (!gatewayApiKey) {
      await updateUserGeneration({
        id: generationId,
        status: 'error',
        polling_response: { error: 'AI Gateway API key not configured (AI_GATEWAY_API_KEY or model API key)' },
      });
      return;
    }

    const gateway = createGateway({ apiKey: gatewayApiKey });
    const gatewayModelId = toGatewayModelId(modelName);

    const resolutionVal = toWanResolution(payload.resolution, payload.aspectRatio);
    const duration =
      typeof payload.duration === 'number' && payload.duration >= 2 && payload.duration <= 15
        ? payload.duration
        : 5;

    const providerOptions: Record<string, unknown> = {
      alibaba: {
        pollTimeoutMs: 600000,
        promptExtend: payload.promptExtend !== false,
      },
    };

    let prompt: string | { image: string; text?: string };

    if (modelName.toLowerCase().includes('i2v') && payload.image && typeof payload.image === 'string') {
      prompt = {
        image: payload.image,
        text: typeof payload.prompt === 'string' ? payload.prompt : undefined,
      };
    } else if (modelName.toLowerCase().includes('r2v')) {
      prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
      const refs = Array.isArray(payload.referenceUrls)
        ? payload.referenceUrls.filter((u: unknown) => typeof u === 'string').slice(0, 5)
        : [];
      if (refs.length > 0) {
        (providerOptions.alibaba as Record<string, unknown>).referenceUrls = refs;
      }
    } else {
      prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    }

    const result = await generateVideo({
      model: gateway.video(gatewayModelId),
      prompt,
      duration,
      resolution: resolutionVal as '1280x720' | '1920x1080' | '720x1280' | '1080x1920' | '960x960' | '1440x1440' | '1088x832' | '1632x1248' | '832x1088' | '1248x1632',
      providerOptions: providerOptions as any,
    }).catch((error: any) => {
      const msg = error?.response?.data?.message ?? error?.message ?? 'Alibaba Wan video generation failed';
      throw new Error(msg);
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
      { source: 'alibaba-wan' }
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
    console.error('alibabaWanVideoGenerate error:', error?.message ?? error);
    await updateUserGeneration({
      id: generationId,
      status: 'error',
      polling_response: {
        error: error?.message ?? 'Alibaba Wan video generation failed',
        stack: error?.stack,
      },
    });
  }
};

import axios from 'axios';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import {
  base64WithoutDataUrl,
  getFileExtensionFromMimeType,
  mimeFromBase64DataUrl,
  saveFileFromBuffer,
} from '../../shared/fileUtils';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';

import {
  googleOmniPollingEndpoint,
  googleServer,
  isGoogleVideoModel,
  isOmniModel,
  trimString,
  type GoogleApiSchema,
} from './googleApiShared';

type GoogleImage = {
  base64: string;
  mimeType: string;
};

type GoogleVideoOutput = {
  urls: string[];
  base64Videos: GoogleImage[];
};

const GOOGLE_IMAGE_SYSTEM_INSTRUCTION =
  'You are an image generation model. Always return an image response for the user request. Do not return text-only output.';

function isGeminiImageRequest(apiSchema: GoogleApiSchema, vendorModelName: string): boolean {
  const requestType = typeof apiSchema.request_type === 'string' ? apiSchema.request_type.trim().toLowerCase() : '';
  const apiPath = typeof apiSchema.api_path === 'string' ? apiSchema.api_path.trim().toLowerCase() : '';
  const modelName = vendorModelName.toLowerCase();
  return requestType === 'generatecontent' || apiPath.includes('generatecontent') || modelName.includes('gemini');
}

function googleEndpoint(apiSchema: GoogleApiSchema, vendorModelName: string, fallbackMethod: string): string {
  const server = googleServer(apiSchema);
  const apiPath = typeof apiSchema.api_path === 'string' ? apiSchema.api_path.trim() : '';
  if (apiPath) return `${server}${apiPath}`;
  return `${server}/models/${encodeURIComponent(vendorModelName)}:${fallbackMethod}`;
}

function googleHeaders(apiKey: string): Record<string, string> {
  const resolvedApiKey = apiKey.trim() || process.env.GOOGLE_API_KEY?.trim() || '';
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': resolvedApiKey,
  };
}

function collectOmniVideoOutput(responseData: unknown): GoogleVideoOutput {
  const urls: string[] = [];
  const base64Videos: GoogleImage[] = [];
  const visitContent = (content: unknown) => {
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      if (entry.type !== 'video') continue;
      const uri = trimString(entry.uri);
      const data = trimString(entry.data);
      const mimeType = trimString(entry.mime_type) || trimString(entry.mimeType) || 'video/mp4';
      if (uri) urls.push(uri);
      else if (data) base64Videos.push({ base64: base64WithoutDataUrl(data), mimeType });
    }
  };

  if (responseData && typeof responseData === 'object') {
    const root = responseData as Record<string, unknown>;
    const outputVideo = root.output_video ?? root.outputVideo;
    if (outputVideo && typeof outputVideo === 'object') {
      const video = outputVideo as Record<string, unknown>;
      const uri = trimString(video.uri);
      const data = trimString(video.data);
      const mimeType = trimString(video.mime_type) || trimString(video.mimeType) || 'video/mp4';
      if (uri) urls.push(uri);
      else if (data) base64Videos.push({ base64: base64WithoutDataUrl(data), mimeType });
    }
    if (Array.isArray(root.steps)) {
      for (const step of root.steps) {
        if (!step || typeof step !== 'object') continue;
        const stepRecord = step as Record<string, unknown>;
        if (stepRecord.type !== 'model_output') continue;
        visitContent(stepRecord.content);
      }
    }
  }

  return {
    urls: [...new Set(urls)],
    base64Videos,
  };
}

function googleFileIdFromUri(uri: string): string {
  return uri.match(/files\/([^/:?]+)/)?.[1] ?? '';
}

async function googleFileState(apiSchema: GoogleApiSchema, apiKey: string, fileId: string): Promise<string> {
  if (!fileId) return '';
  const response = await axios.get(`${googleServer(apiSchema)}/files/${encodeURIComponent(fileId)}`, {
    headers: googleHeaders(apiKey),
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`google file status request failed with status ${response.status}`);
  }
  return trimString((response.data as Record<string, unknown>)?.state);
}

async function urlToInlinePart(url: string): Promise<Record<string, unknown>> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`google input image download failed with status ${response.status}`);
  }
  const mimeType = response.headers['content-type']?.split(';')[0]?.trim() || 'image/png';
  const data = Buffer.from(response.data).toString('base64');
  return { inlineData: { mimeType, data } };
}

async function imageInputToGeminiPart(input: unknown): Promise<Record<string, unknown> | null> {
  if (!input) return null;
  if (typeof input === 'string') {
    const value = input.trim();
    if (!value) return null;
    if (/^data:/i.test(value)) {
      return {
        inlineData: {
          mimeType: mimeFromBase64DataUrl(value),
          data: base64WithoutDataUrl(value),
        },
      };
    }
    if (/^https?:\/\//i.test(value)) {
      return urlToInlinePart(value);
    }
    return null;
  }
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const item = input as Record<string, unknown>;
  if (item.inlineData || item.inline_data) return item;
  const url = trimString(item.url);
  if (url) return imageInputToGeminiPart(url);
  return null;
}

function googleSearchTools(payload: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const enableWebSearch = payload.enable_web_search === true || payload.enableWebSearch === true;
  const enableImageSearch = payload.enable_image_search === true || payload.enableImageSearch === true;
  if (!enableWebSearch && !enableImageSearch) return undefined;

  const googleSearch: Record<string, unknown> = {};
  if (enableImageSearch) {
    googleSearch.searchTypes = {
      ...(enableWebSearch ? { webSearch: {} } : {}),
      imageSearch: {},
    };
  }

  return [{ google_search: googleSearch }];
}

function googleImageSystemInstruction(existing: unknown): Record<string, unknown> {
  const instructionPart = { text: GOOGLE_IMAGE_SYSTEM_INSTRUCTION };
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return { parts: [instructionPart] };
  }

  const out = { ...(existing as Record<string, unknown>) };
  const parts = Array.isArray(out.parts) ? out.parts : [];
  out.parts = [instructionPart, ...parts];
  return out;
}

async function googleGeminiImageRequestPayload(payload: unknown): Promise<Record<string, unknown>> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const tools = googleSearchTools(originalPayload);
  if (Array.isArray(originalPayload.contents)) {
    const requestPayload = { ...originalPayload };
    delete requestPayload.enable_web_search;
    delete requestPayload.enableWebSearch;
    delete requestPayload.enable_image_search;
    delete requestPayload.enableImageSearch;
    if (tools) requestPayload.tools = tools;
    const generationConfig =
      requestPayload.generationConfig && typeof requestPayload.generationConfig === 'object'
        ? { ...(requestPayload.generationConfig as Record<string, unknown>) }
        : {};
    generationConfig.responseModalities = ['IMAGE'];
    requestPayload.generationConfig = generationConfig;
    requestPayload.systemInstruction = googleImageSystemInstruction(requestPayload.systemInstruction);
    return requestPayload;
  }

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  const parts: Record<string, unknown>[] = prompt ? [{ text: prompt }] : [];
  const images = Array.isArray(originalPayload.images)
    ? originalPayload.images
    : originalPayload.image
      ? [originalPayload.image]
      : [];

  for (const image of images) {
    const part = await imageInputToGeminiPart(image);
    if (part) parts.push(part);
  }

  const generationConfig: Record<string, unknown> =
    originalPayload.generationConfig && typeof originalPayload.generationConfig === 'object'
      ? { ...(originalPayload.generationConfig as Record<string, unknown>) }
      : {};
  const imageConfig: Record<string, unknown> =
    generationConfig.imageConfig && typeof generationConfig.imageConfig === 'object'
      ? { ...(generationConfig.imageConfig as Record<string, unknown>) }
      : {};
  const aspectRatio = trimString(originalPayload.aspect_ratio) || trimString(originalPayload.aspectRatio);
  const resolution = trimString(originalPayload.resolution);
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (resolution) imageConfig.imageSize = resolution;
  if (Object.keys(imageConfig).length > 0) generationConfig.imageConfig = imageConfig;
  generationConfig.responseModalities = ['IMAGE'];

  return {
    contents: [{ parts }],
    systemInstruction: googleImageSystemInstruction(originalPayload.systemInstruction),
    ...(tools ? { tools } : {}),
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };
}

function googleImagenRequestPayload(payload: unknown): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  if (Array.isArray(originalPayload.instances)) return originalPayload;

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  const parameters = {
    ...(originalPayload.parameters && typeof originalPayload.parameters === 'object' ? originalPayload.parameters : {}),
  } as Record<string, unknown>;
  const sampleCount = originalPayload.num_images ?? originalPayload.max_images ?? originalPayload.n;
  const aspectRatio = trimString(originalPayload.aspect_ratio) || trimString(originalPayload.aspectRatio);
  const resolution = trimString(originalPayload.resolution);

  if (sampleCount != null) parameters.sampleCount = sampleCount;
  if (aspectRatio) parameters.aspectRatio = aspectRatio;
  if (resolution) parameters.sampleImageSize = resolution;

  return {
    instances: [{ prompt }],
    parameters,
  };
}

function collectGoogleBase64Images(responseData: unknown): GoogleImage[] {
  const out: GoogleImage[] = [];
  const visit = (value: unknown, inheritedMime = 'image/png') => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, inheritedMime));
      return;
    }
    if (typeof value !== 'object') return;

    const item = value as Record<string, unknown>;
    const mimeType =
      trimString(item.mimeType) || trimString(item.mime_type) || trimString(item.contentType) || inheritedMime;
    const base64 =
      trimString(item.bytesBase64Encoded) ||
      trimString(item.imageBytes) ||
      trimString(item.b64_json) ||
      trimString(item.base64) ||
      trimString(item.data) ||
      trimString(item.Data);
    const hasImageData =
      item.bytesBase64Encoded ||
      item.imageBytes ||
      item.b64_json ||
      item.base64 ||
      ((item.data || item.Data) && mimeType.toLowerCase().startsWith('image/'));

    if (base64 && hasImageData) {
      out.push({ base64: base64WithoutDataUrl(base64), mimeType: mimeFromBase64DataUrl(base64, mimeType) });
      return;
    }

    if (item.inlineData) visit(item.inlineData, mimeType);
    if (item.inline_data) visit(item.inline_data, mimeType);
    if (item.image) visit(item.image, mimeType);
    if (item.predictions) visit(item.predictions, mimeType);
    if (item.generatedImages) visit(item.generatedImages, mimeType);
    if (item.candidates) visit(item.candidates, mimeType);
    if (item.content) visit(item.content, mimeType);
    if (item.parts) visit(item.parts, mimeType);
  };
  visit(responseData);
  return out;
}

function collectStringValues(value: unknown, keys: Set<string>): string[] {
  const out: string[] = [];
  const visit = (item: unknown) => {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item !== 'object') return;
    for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
      if (keys.has(key) && typeof entry === 'string' && entry.trim()) out.push(entry.trim());
      else visit(entry);
    }
  };
  visit(value);
  return [...new Set(out)];
}

function googleErrorMessage(responseData: unknown): string {
  if (responseData && typeof responseData === 'object') {
    const error = (responseData as Record<string, unknown>).error;
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
  }
  return 'Generation failed, please try again.';
}

function googlePollingRequest(
  apiSchema: GoogleApiSchema,
  vendorModelName: string,
  taskId: string
): { method: 'get' | 'post'; endpoint: string; body?: Record<string, unknown> } {
  const server = googleServer(apiSchema);
  const pollingPath = typeof apiSchema.polling_path === 'string' ? apiSchema.polling_path.trim() : '';
  const pollingMethod =
    typeof apiSchema.polling_method === 'string' ? apiSchema.polling_method.trim().toLowerCase() : '';

  if (pollingMethod === 'post' || pollingPath.includes('fetchPredictOperation')) {
    const endpoint = pollingPath
      ? `${server}${pollingPath}`
      : `${server}/models/${vendorModelName}:fetchPredictOperation`;
    return { method: 'post', endpoint, body: { operationName: taskId } };
  }

  if (pollingPath) {
    const endpoint = pollingPath.includes('{operationName}')
      ? `${server}${pollingPath.replace('{operationName}', encodeURIComponent(taskId))}`
      : `${server}${pollingPath}${pollingPath.endsWith('/') ? '' : '/'}${taskId}`;
    return { method: 'get', endpoint };
  }

  return { method: 'get', endpoint: `${server}/${taskId}` };
}

async function saveGoogleUrlFile(url: string, apiKey: string, runId: string, run: unknown, responseData: unknown) {
  if (url.startsWith('gs://')) {
    throw new Error('google returned a gs:// URI; configure Gemini API file URI output or a downloadable HTTPS URL');
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { 'x-goog-api-key': apiKey.trim() || process.env.GOOGLE_API_KEY?.trim() || '' },
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`google media download failed with status ${response.status}`);
  }

  const mimeType = response.headers['content-type']?.split(';')[0]?.trim() || 'video/mp4';
  const ext = getFileExtensionFromMimeType(mimeType);
  return saveFileFromBuffer(Buffer.from(response.data), `google-${runId}.${ext}`, mimeType, run, responseData);
}

async function handleGoogleImage(context: WebhookVendorContext<GoogleApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey, vendorModelName } = context;
  const isGeminiImage = isGeminiImageRequest(apiSchema, vendorModelName);
  const endpoint = googleEndpoint(apiSchema, vendorModelName, isGeminiImage ? 'generateContent' : 'predict');
  const requestPayload = isGeminiImage
    ? await googleGeminiImageRequestPayload(run.payload)
    : googleImagenRequestPayload(run.payload);
  let lastResponse: unknown = {};

  try {
    console.log('[webhookGoogle] image request', { endpoint, run_id: run.id, db_status: rowStatus });
    const response = await axios.post(endpoint, requestPayload, {
      headers: googleHeaders(apiKey),
      validateStatus: () => true,
    });

    lastResponse = response.data ?? {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`google image request failed with status ${response.status}`);
    }

    const images = collectGoogleBase64Images(lastResponse);
    // Gemini image responses may include grounding/search result URLs. Those are citations, not generated files.
    const urls = isGeminiImage ? [] : collectStringValues(lastResponse, new Set(['url', 'uri', 'gcsUri']));
    if (images.length === 0 && urls.length === 0) {
      throw new Error(googleErrorMessage(lastResponse) || 'google image response did not include images');
    }

    if (images.length > 0) {
      const files: unknown[] = [];
      for (let index = 0; index < images.length; index++) {
        const image = images[index];
        const ext = getFileExtensionFromMimeType(image.mimeType);
        const savedFile = await saveFileFromBuffer(
          Buffer.from(image.base64, 'base64'),
          `google-${runId}-${index + 1}.${ext}`,
          image.mimeType,
          run,
          lastResponse
        );
        if (savedFile) files.push(savedFile);
      }
      await completeWebhookRun({ run, response: lastResponse, files, duration: durationForRun(run) });
      return;
    }

    const savedFiles = await processResponse(urls, run, lastResponse);
    await completeWebhookRun({ run, response: lastResponse, files: savedFiles, duration: durationForRun(run) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookGoogle] image error', { run_id: run.id, message });
    await errorWebhookRun({ run, response: lastResponse, message, duration: durationForRun(run) });
    throw error;
  }
}

async function handleGoogleVideo(context: WebhookVendorContext<GoogleApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey, vendorModelName } = context;
  const taskId = typeof run.task_id === 'string' ? run.task_id.trim() : '';
  let lastResponse: unknown = {};

  if (!taskId) {
    throw new Error('google video task_id missing');
  }

  try {
    const request = googlePollingRequest(apiSchema, vendorModelName, taskId);
    console.log('[webhookGoogle] video poll', {
      endpoint: request.endpoint,
      method: request.method,
      run_id: run.id,
      task_id: taskId,
      db_status: rowStatus,
    });
    const response =
      request.method === 'post'
        ? await axios.post(request.endpoint, request.body, {
            headers: googleHeaders(apiKey),
            validateStatus: () => true,
          })
        : await axios.get(request.endpoint, { headers: googleHeaders(apiKey), validateStatus: () => true });

    lastResponse = response.data ?? {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`google video polling failed with status ${response.status}`);
    }

    if ((lastResponse as Record<string, unknown>).error) {
      await errorWebhookRun({
        run,
        response: lastResponse,
        message: googleErrorMessage(lastResponse),
        duration: durationForRun(run),
      });
      return;
    }

    const done = (lastResponse as Record<string, unknown>).done === true;
    const urls = collectStringValues(lastResponse, new Set(['uri', 'url', 'gcsUri']));
    if (done && urls.length > 0) {
      const files: unknown[] = [];
      for (let index = 0; index < urls.length; index++) {
        const savedFile = await saveGoogleUrlFile(urls[index], apiKey, `${runId}-${index + 1}`, run, lastResponse);
        if (savedFile) files.push(savedFile);
      }
      await completeWebhookRun({ run, response: lastResponse, files, duration: durationForRun(run) });
      return;
    }

    if (done && urls.length === 0) {
      await errorWebhookRun({
        run,
        response: lastResponse,
        message: 'google video operation completed but no video URI was returned',
        duration: durationForRun(run),
      });
      return;
    }

    await tickWebhookRun({ runId, duration: durationForRun(run), delayMs: 5000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookGoogle] video error', { run_id: run.id, message });
    await errorWebhookRun({ run, response: lastResponse, message, duration: durationForRun(run) });
    throw error;
  }
}

async function handleGoogleOmni(context: WebhookVendorContext<GoogleApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey } = context;
  const taskId = trimString(run.task_id);
  let lastResponse: unknown = {};

  if (!taskId) {
    throw new Error('google omni task_id missing');
  }

  try {
    const endpoint = googleOmniPollingEndpoint(apiSchema, taskId);
    console.log('[webhookGoogle] omni poll', {
      endpoint,
      run_id: run.id,
      task_id: taskId,
      db_status: rowStatus,
    });
    const response = await axios.get(endpoint, {
      headers: googleHeaders(apiKey),
      validateStatus: () => true,
    });

    lastResponse = response.data ?? {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`google omni polling failed with status ${response.status}`);
    }

    if ((lastResponse as Record<string, unknown>).error) {
      await errorWebhookRun({
        run,
        response: lastResponse,
        message: googleErrorMessage(lastResponse),
        duration: durationForRun(run),
      });
      return;
    }

    const status = trimString((lastResponse as Record<string, unknown>).status).toLowerCase();
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      await errorWebhookRun({
        run,
        response: lastResponse,
        message: googleErrorMessage(lastResponse) || 'Google Omni generation failed',
        duration: durationForRun(run),
      });
      return;
    }

    if (status !== 'completed') {
      await tickWebhookRun({ runId, duration: durationForRun(run), delayMs: 5000 });
      return;
    }

    const { urls, base64Videos } = collectOmniVideoOutput(lastResponse);
    const readyUrls: string[] = [];
    for (const url of urls) {
      const fileId = googleFileIdFromUri(url);
      if (!fileId) {
        readyUrls.push(url);
        continue;
      }
      const fileState = await googleFileState(apiSchema, apiKey, fileId);
      if (fileState === 'FAILED') {
        throw new Error('google omni video file processing failed');
      }
      if (fileState !== 'ACTIVE') {
        await tickWebhookRun({ runId, duration: durationForRun(run), delayMs: 5000 });
        return;
      }
      readyUrls.push(url);
    }

    if (readyUrls.length === 0 && base64Videos.length === 0) {
      await errorWebhookRun({
        run,
        response: lastResponse,
        message: 'google omni interaction completed but no video output was returned',
        duration: durationForRun(run),
      });
      return;
    }

    const files: unknown[] = [];
    for (let index = 0; index < base64Videos.length; index++) {
      const video = base64Videos[index];
      const ext = getFileExtensionFromMimeType(video.mimeType);
      const savedFile = await saveFileFromBuffer(
        Buffer.from(video.base64, 'base64'),
        `google-${runId}-${index + 1}.${ext}`,
        video.mimeType,
        run,
        lastResponse
      );
      if (savedFile) files.push(savedFile);
    }

    for (let index = 0; index < readyUrls.length; index++) {
      const savedFile = await saveGoogleUrlFile(
        readyUrls[index],
        apiKey,
        `${runId}-${base64Videos.length + index + 1}`,
        run,
        lastResponse
      );
      if (savedFile) files.push(savedFile);
    }

    await completeWebhookRun({ run, response: lastResponse, files, duration: durationForRun(run) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookGoogle] omni error', { run_id: run.id, message });
    await errorWebhookRun({ run, response: lastResponse, message, duration: durationForRun(run) });
    throw error;
  }
}

export async function webhookGoogle(context: WebhookVendorContext<GoogleApiSchema>): Promise<void> {
  const apiSchema = context.apiSchema;
  if (isOmniModel(context.vendorModelName, apiSchema)) {
    await handleGoogleOmni(context);
    return;
  }
  if (isGoogleVideoModel(context.vendorModelName, context.genModel.generation_type, apiSchema)) {
    await handleGoogleVideo(context);
    return;
  }
  await handleGoogleImage(context);
}

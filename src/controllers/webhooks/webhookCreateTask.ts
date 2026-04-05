import { saveFileFromUrl } from '../generate/generateUtils';
import { createUserGenerationFile, updateUserGeneration } from '../generate/generateData';
import axios from 'axios';

/** Persist poll failure on the generation and throw so webhook handling can abort. */
const failWebhookGeneration = async (pollingFileData: any, pollingFileResponse: any): Promise<never> => {
  await updateUserGeneration({
    id: pollingFileData.id,
    status: 'error',
    polling_response: pollingFileResponse,
  });
  throw new Error(`API error: ${pollingFileResponse?.err_code ?? 'unknown'}`);
};

const kieProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse.data?.state;
  if (status === 'fail') {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  if (status === 'success') {
    return await processResponse(pollingFileResponse.data?.resultJson, pollingFileData, pollingFileResponse);
  }
  return { status: 'pending', files: [] };
};

const wanProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse.output?.task_status;
  if (status === 'FAILED') {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  if (status === 'SUCCEEDED') {
    const fileUrl = pollingFileResponse.output?.video_url ?? null;
    return await processResponse(fileUrl, pollingFileData, pollingFileResponse);
  }
  return { status: 'pending', files: [] };
};

const viduProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse.state;
  if (status === 'failed') {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  if (status === 'success') {
    const fileUrl = pollingFileResponse.creations?.[0]?.url ?? null;
    return await processResponse(fileUrl, pollingFileData, pollingFileResponse);
  }
  return { status: 'pending', files: [] };
};

const klingProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse.data?.task_status;
  if (status === 'failed') {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  if (status === 'succeed') {
    const taskResult = pollingFileResponse?.data?.task_result ?? {};
    const mediaItems = Array.isArray(taskResult.images)
      ? taskResult.images
      : Array.isArray(taskResult.videos)
        ? taskResult.videos
        : [];
    const fileUrl = mediaItems?.[0]?.url ?? null;
    return await processResponse(fileUrl, pollingFileData, pollingFileResponse);
  }
  return { status: 'pending', files: [] };
};

const falProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse?.status;
  if (pollingFileResponse?.error) {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  if (status === 'COMPLETED') {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Key ${pollingFileData?.api_id?.key?.key}`,
    };
    const response: any = await axios
    .get(`${pollingFileData?.api_id?.poll_url}${pollingFileData?.task_id}`, {
      headers: headers,
      validateStatus: () => true,
    })
    .catch(async error => {
      await failWebhookGeneration(pollingFileData, error?.response?.data);
    });
    const images = response?.data?.images || [];
    const fileUrl = Array.isArray(images) && images[0]?.url ? (images[0].url || '').trim() || null : null;
    return await processResponse(fileUrl, pollingFileData, pollingFileResponse);
  }
  return { status: 'pending', files: [] };
};
const eachlabsProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse?.status;
  if (status === 'failed' || status === 'cancelled') {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  if (status === 'success') {
    return await processResponse(pollingFileResponse?.output, pollingFileData, pollingFileResponse);
  }
  return { status: 'pending', files: [] };
};

const wavespeedProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse?.data?.status;
  if (status === 'failed') {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  if (status === 'completed') {
    return await processResponse(pollingFileResponse?.data?.outputs, pollingFileData, pollingFileResponse);
  }
  return { status: 'pending', files: [] };
};

const processResponse = async (output: any, pollingFileData: any,pollingFileResponse: any) => {

  if (Array.isArray(output)) {
    const files: any[] = [];
    for (let index = 0; index < output.length; index++) {
      const url = output[index];
      if (typeof url === 'string' && url.trim()) {
        try {
          const savedFile: any = await saveFileFromUrl(url.trim(), pollingFileData, pollingFileResponse);
          if (savedFile) files.push(savedFile);
        } catch (error) {
          await failWebhookGeneration(pollingFileData, pollingFileResponse);
        }
      }
    }
    return { status: 'completed', files: files };
  }

  const fileUrl = typeof output === 'string' ? output : null;
  try {
    const savedFile: any = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
    if (savedFile) return { status: 'completed', files: [savedFile] };
  } catch (error) {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  throw new Error('API error: unknown');
};

export const webhookCreateTask = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';

  let processResult: any = {};
  switch (pollingFileData.api_id.poll_type) {
    case 'wan':
      processResult = await wanProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    case 'kie':
      processResult = await kieProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    case 'vidu':
      processResult = await viduProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    case 'kling':
      processResult = await klingProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    case 'fal':
      processResult = await falProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    case 'eachlabs':
      processResult = await eachlabsProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    case 'wavespeed':
      processResult = await wavespeedProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    default:
      processResult = await kieProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
  }

  for (const file of processResult.files) {
    await createUserGenerationFile({
      generation_id: pollingFileData.id,
      file_id: file.file_id,
    });
  }

  return status;
};

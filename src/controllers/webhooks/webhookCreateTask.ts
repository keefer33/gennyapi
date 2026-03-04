import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';

/** Shared: save a file from URL and return { status, files } for webhook processing. */
const processResponseWithFileUrl = async (
  isCompleted: boolean,
  fileUrl: string | null,
  pollingFileData: any,
  pollingFileResponse: any
): Promise<{ status: string; files: any[] }> => {
  const files: any[] = [];
  if (isCompleted && fileUrl) {
    try {
      const savedFile: any = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
      if (savedFile) files.push(savedFile);
    } catch (error) {
      console.error('Error saving file:', fileUrl, error);
    }
  }
  return { status: isCompleted ? 'completed' : 'pending', files };
};

const kieProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const isSuccess = pollingFileResponse.data?.state === 'success';
  let fileUrl: string | null = null;
  if (isSuccess && pollingFileResponse.data?.resultJson) {
    const resultJson = JSON.parse(pollingFileResponse.data.resultJson);
    if (resultJson.resultUrls && Array.isArray(resultJson.resultUrls)) {
      fileUrl = resultJson.resultUrls[0] || null;
    } else if (resultJson.resultUrls && typeof resultJson.resultUrls === 'string') {
      fileUrl = resultJson.resultUrls;
    }
  }
  return processResponseWithFileUrl(isSuccess, fileUrl, pollingFileData, pollingFileResponse);
};

const wanProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const isSuccess = pollingFileResponse.output?.task_status === 'SUCCEEDED';
  const fileUrl = isSuccess ? pollingFileResponse.output?.video_url ?? null : null;
  return processResponseWithFileUrl(isSuccess, fileUrl, pollingFileData, pollingFileResponse);
};

const viduProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const state = pollingFileResponse.state;
  if (state === 'failed') {
    await updateUserGeneration({
      id: pollingFileData.id,
      status: 'error',
      polling_response: pollingFileResponse,
    });
    throw new Error(`API error: ${pollingFileResponse?.err_code ?? 'unknown'}`);
  }
  const isSuccess = state === 'success';
  const fileUrl = isSuccess ? pollingFileResponse.creations?.[0]?.url ?? null : null;
  return processResponseWithFileUrl(isSuccess, fileUrl, pollingFileData, pollingFileResponse);
};

const klingProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse.data?.task_status;
  if (status === 'failed') {
    await updateUserGeneration({
      id: pollingFileData.id,
      status: 'error',
      polling_response: pollingFileResponse,
    });
    throw new Error(`API error: ${pollingFileResponse?.err_code ?? 'unknown'}`);
  }
  const isSuccess = status === 'succeed';
  let fileUrl: string | null = null;
  if (isSuccess) {
    const taskResult = pollingFileResponse?.data?.task_result ?? {};
    const mediaItems = Array.isArray(taskResult.images)
      ? taskResult.images
      : Array.isArray(taskResult.videos)
        ? taskResult.videos
        : [];
    fileUrl = mediaItems?.[0]?.url ?? null;
    if (!fileUrl) {
      throw new Error('Kling webhook missing media URL in task_result');
    }
  }
  return processResponseWithFileUrl(isSuccess, fileUrl, pollingFileData, pollingFileResponse);
};

const falProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const images = pollingFileResponse?.images;
  const fileUrl =
    Array.isArray(images) && images[0]?.url ? (images[0].url || '').trim() || null : null;
  const isCompleted = !!fileUrl;
  return processResponseWithFileUrl(isCompleted, fileUrl, pollingFileData, pollingFileResponse);
};

const replicateProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse?.status;
  const isSuccess = status === 'succeeded';
  const fileUrl =
    isSuccess && typeof pollingFileResponse?.output === 'string'
      ? pollingFileResponse.output
      : null;
  return processResponseWithFileUrl(isSuccess, fileUrl, pollingFileData, pollingFileResponse);
};

const eachlabsProcessResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  const status = pollingFileResponse?.status;
  const isSuccess = status === 'success';
  const fileUrl =
    isSuccess && typeof pollingFileResponse?.output === 'string'
      ? pollingFileResponse.output
      : null;
  return processResponseWithFileUrl(isSuccess, fileUrl, pollingFileData, pollingFileResponse);
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
    case 'replicate':
      processResult = await replicateProcessResponse(pollingFileResponse, pollingFileData);
      status = processResult.status;
      break;
    case 'eachlabs':
      processResult = await eachlabsProcessResponse(pollingFileResponse, pollingFileData);
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

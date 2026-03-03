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

export const webhookCreateTask = async (pollingFileData: any, pollingFileResponse: any) => {
  let api = pollingFileData?.api_id;
  let status = 'pending';
  const files: any[] = [];
  let cost = 0;

  if (
    pollingFileResponse.code !== 200 ||
    pollingFileResponse.data?.state === 'fail' ||
    pollingFileResponse.data?.successFlag === 3
  ) {
    await updateUserGeneration({
      id: pollingFileData.id,
      status: 'error',
      polling_response: pollingFileResponse,
    });
    throw new Error(`API error: ${pollingFileResponse?.code} ${pollingFileResponse?.msg}`);
  }

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

import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';

// Veo record info processing function (placeholder)
const recordInfoProcess = async (pollingFileResponse: any, pollingFileData: any) => {
  let status = 'pending';
  let savedFile: any = null;

  if (pollingFileResponse.data?.successFlag === 1) {
    status = 'completed';
    const resultJson = pollingFileResponse.data.response;

    // Handle different resultJson formats:
    // 1. If resultJson is an array, use the first item
    // 2. If resultJson has resultUrls array, use the first item
    // 3. If resultJson has resultImageUrl string, use it
    let fileUrl: string | null = null;
    if (Array.isArray(resultJson)) {
      fileUrl = resultJson[0] || null;
    } else if (resultJson?.resultUrls && Array.isArray(resultJson.resultUrls)) {
      fileUrl = resultJson.resultUrls[0] || null;
    } else if (resultJson?.resultImageUrl && typeof resultJson.resultImageUrl === 'string') {
      fileUrl = resultJson.resultImageUrl;
    }

    if (fileUrl) {
      try {
        savedFile = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
      } catch (error) {
        console.error('Error saving single file:', fileUrl, error);
      }
    } else {
      console.warn('No file URL found in resultJson:', resultJson);
    }
  } else {
    status = 'pending';
  }

  return { status, savedFile };
};

export const webhookCustomApiGenerate = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';

  console.log('pollingFileResponse', pollingFileResponse);
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

  const processResult = await recordInfoProcess(pollingFileResponse, pollingFileData);

  status = processResult.status;

  if (processResult.savedFile) {
    await createUserGenerationFile({
      generation_id: pollingFileData.id,
      file_id: processResult.savedFile.file_id,
    });
  }

  return status;
};

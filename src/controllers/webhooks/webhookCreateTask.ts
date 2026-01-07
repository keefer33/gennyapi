import axios from 'axios';
import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';

// Default jobs processing function
const processResponse = async (pollingFileResponse: any, pollingFileData: any) => {
  let status = 'pending';
  const files: any[] = [];
  let cost = 0;

  if (pollingFileResponse.data?.state === 'success') {
    status = 'completed';
    const resultJson = JSON.parse(pollingFileResponse.data.resultJson);

    // Process only the first file (index 0 if array, or the string itself)
    let fileUrl: string | null = null;
    if (resultJson.resultUrls && Array.isArray(resultJson.resultUrls)) {
      fileUrl = resultJson.resultUrls[0] || null;
    } else if (resultJson.resultUrls && typeof resultJson.resultUrls === 'string') {
      fileUrl = resultJson.resultUrls;
    }

    if (fileUrl) {
      try {
        const savedFile: any = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
        if (savedFile) {
          files.push(savedFile);
        }
      } catch (error) {
        console.error('Error saving file:', fileUrl, error);
      }
    }
  } else {
    status = 'pending';
  }

  return { status, files };
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

  const processResult = await processResponse(pollingFileResponse, pollingFileData);

  status = processResult.status;

  for (const file of processResult.files) {
    await createUserGenerationFile({
      generation_id: pollingFileData.id,
      file_id: file.file_id,
    });
  }

  return status;
};

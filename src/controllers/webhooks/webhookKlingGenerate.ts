import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';

/** Expected completed output: { images: [ { url: "https://..." } ] } */
export const webhookKlingGenerate = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';
  const files: any[] = [];

  status = pollingFileResponse.data.task_status;

  if (
    status === 'failed' 
  ) {
    await updateUserGeneration({            
      id: pollingFileData.id,
      status: 'error',
      polling_response: pollingFileResponse,
    });
    throw new Error(`API error: ${pollingFileResponse?.err_code}`);
  }
 
  if (status === 'succeed') {
    const task_result = pollingFileResponse.data.task_result;
    task_result === 'images' ? 'images' : 'videos';
    const fileUrl = pollingFileResponse.task_result[task_result][0].url;
    const savedFile: any = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
    await createUserGenerationFile({
      generation_id: pollingFileData.id,
      file_id: savedFile.file_id,
    });
    status = 'completed';
  } else {
    status = 'pending';
  }

  return status;
};

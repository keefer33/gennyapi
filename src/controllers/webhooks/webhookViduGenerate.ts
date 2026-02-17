import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';

/** Expected completed output: { images: [ { url: "https://..." } ] } */
export const webhookViduGenerate = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';
  const files: any[] = [];

  status = pollingFileResponse.state;

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

  if (status === 'success') {
    const videoUrl = pollingFileResponse.creations[0].url;
    const savedFile: any = await saveFileFromUrl(videoUrl, pollingFileData, pollingFileResponse);
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

import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile } from '../../utils/getSupaData';

export const webhookPrediction = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';
  const files: any[] = [];

  status = pollingFileResponse.status;
  if (status === 'succeeded') {
    const videoUrl = pollingFileResponse.output;
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

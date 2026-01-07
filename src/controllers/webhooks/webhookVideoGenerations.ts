import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile } from '../../utils/getSupaData';

export const webhookVideoGenerations = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';
  const files: any[] = [];

  status = pollingFileResponse.status;
  if (status === 'completed') {
    const videoUrl = pollingFileResponse.video.url;
    const savedFile: any = await saveFileFromUrl(videoUrl, pollingFileData, pollingFileResponse);
    await createUserGenerationFile({
      generation_id: pollingFileData.id,
      file_id: savedFile.file_id,
    });
  } else {
    status = 'pending';
  }

  return status;
};

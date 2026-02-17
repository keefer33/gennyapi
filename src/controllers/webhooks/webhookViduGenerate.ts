import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile } from '../../utils/getSupaData';

/** Expected completed output: { images: [ { url: "https://..." } ] } */
export const webhookViduGenerate = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';
  const files: any[] = [];

  status = pollingFileResponse.state;
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

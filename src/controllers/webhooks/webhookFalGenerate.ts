import { saveFileFromUrl } from '../../utils/generate';
import { createUserGenerationFile } from '../../utils/getSupaData';

/** Expected completed output: { images: [ { url: "https://..." } ] } */
export const webhookFalGenerate = async (pollingFileData: any, pollingFileResponse: any) => {
  let status = 'pending';
  const images = pollingFileResponse?.images;
  const imageUrl = Array.isArray(images) && images[0]?.url ? (images[0].url || '').trim() : '';

  if (imageUrl) {
    const savedFile: any = await saveFileFromUrl(imageUrl, pollingFileData, pollingFileResponse);
    await createUserGenerationFile({
      generation_id: pollingFileData.id,
      file_id: savedFile.file_id,
    });
    status = 'completed';
  }

  return status;
};

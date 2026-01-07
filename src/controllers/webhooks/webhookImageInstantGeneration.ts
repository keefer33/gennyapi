import axios, { AxiosResponse } from 'axios';
import { createUserGenerationFile, updateUserGeneration } from '../../utils/getSupaData';
import { saveFileFromUrl } from '../../utils/generate';

export const webhookImageInstantGeneration = async (pollingFileData: any) => {
  const endpoint = pollingFileData.api_id.api_url;
  const payload = {
    model: pollingFileData.api_id.model_name,
    ...pollingFileData.payload,
  }
  
  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pollingFileData.api_id.key.key}`,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error));
      throw new Error(error.response?.data?.message || error.message || 'Failed to generate');
    });

    console.log('response', response.data);
    const savedFile: any = await saveFileFromUrl(response.data.data[0].url, pollingFileData, response);
    await createUserGenerationFile({
      generation_id: pollingFileData.id,
      file_id: savedFile.file_id,
    });

    console.log('response', response.data);
    await updateUserGeneration({
      id: pollingFileData.id,
      response: response.data,
      status: 'completed',
    });
    return 'completed';

};

import axios from 'axios';
import { calculatePricing, saveFileFromUrl } from './generate';
import { updateUserGeneration } from './getSupaData';

export const aimlGenerateVideoEndpoint = async (pollingFile: any, modelData: any) => {
  let status = 'pending';
  const files: any[] = [];
  let cost = 0;
  let pollingFileResponse: any = null;
  const endpoint = modelData.config?.poll + pollingFile.task_id;

  const response = await axios.get(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AIML_API_KEY}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    console.error('Error in aimlGenerateVideoEndpoint:', response.statusText);
    status = 'error';
    const errorResponse = {
      code: response.status,
      msg: response.statusText,
    };
    const error: any = new Error(JSON.stringify(errorResponse));
    error.name = 'AIMLError';
    throw error;
  } else {
    pollingFileResponse = response.data;
    console.log('pollingFileResponse', pollingFileResponse);

    console.log('pollingFileResponse.status', pollingFileResponse.status);
    if (pollingFileResponse.status === 'completed') {
      status = 'completed';
      const file: any = await saveFileFromUrl(pollingFileResponse.video.url, pollingFile, pollingFileResponse);
      if (file) {
        files.push(file);
      }

      cost = calculatePricing(pollingFile.models, pollingFileResponse);
    } else if (pollingFileResponse.status === 'failed' || pollingFileResponse.status === 'fail') {
      status = 'failed';
      console.log('Task failed with status:', pollingFileResponse.status);
      console.log('Failure details:', pollingFileResponse);
    } else {
      status = 'pending';
    }
  }

  const duration = Math.floor((Date.now() - new Date(pollingFile.created_at).getTime()) / 1000);
  await updateUserGeneration({
    id: pollingFile.id,
    status: status,
    polling_response: pollingFileResponse,
    duration: duration,
    cost: cost,
  });
};

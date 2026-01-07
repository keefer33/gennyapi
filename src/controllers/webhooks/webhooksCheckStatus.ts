import axios from 'axios';
import { updateUserGeneration } from '../../utils/getSupaData';

export const webhookCheckStatus = async (pollingFileData: any) => {
  let api = pollingFileData?.api_id;
  let status = 'pending';
  const files: any[] = [];
  let pollingFileResponse: any = null;
  let headers: any = {};
  if (api.api_type === 'mergeVideos') {
    headers = {
      'Content-Type': 'application/json',
      'X-API-Key': api.key.key,
    };
  } else {
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${api.key.key}`,
    };
  }

  const endpoint = `${api?.poll_url}${pollingFileData?.task_id}`;
  const response = await axios.get(endpoint, {
    headers: headers,
    validateStatus: () => true,
  }).catch(async (error) => {
    console.log('error', JSON.stringify(error.response.data));
    await updateUserGeneration({
      id: pollingFileData.id,
      status: 'error',
      polling_response: error.response.data,
    });
    throw new Error(error.response?.data?.message || error.message || 'Failed to generate');
  });

  if (response.status < 200 || response.status >= 300) {
    console.error('Error in videoGenerationsEndpoint:', response.statusText);
    status = 'error';
    pollingFileResponse = {
      code: response.status,
      msg: response.statusText
    };
    await updateUserGeneration({
      id: pollingFileData.id,
      status: 'error',
      polling_response: pollingFileResponse,
    });
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }

  return response.data;
};

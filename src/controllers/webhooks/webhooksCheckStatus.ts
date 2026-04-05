import axios from 'axios';
import { updateUserGeneration } from '../generate/generateData';
import { klingCreateJWT } from '../../shared/klingCreateJWT';

export const webhookCheckStatus = async (pollingFileData: any) => {
  let api = pollingFileData?.api_id;
  let pollingFileResponse: any = null;
  let status = 'pending';
  let endpoint = `${api?.poll_url}${pollingFileData?.task_id}`;

  let headers: any = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${api.key.key}`,
  };

  switch (api.api_type) {
    case 'createTask':
      if (api.poll_type === 'wavespeed') {
        endpoint = `${api?.poll_url}${pollingFileData?.task_id}/result`;
      } else if (api.poll_type === 'eachlabs') {
        headers = {
          'Content-Type': 'application/json',
          'X-API-Key': api.key.key,
        };
      } else if (api.poll_type === 'fal') {
        endpoint = `${api?.poll_url}${pollingFileData?.task_id}/status?logs=1`;
        headers = {
          'Content-Type': 'application/json',
          Authorization: `Key ${api.key.key}`,
        };
      } else if (api.poll_type === 'kling') {
        endpoint = `${api?.poll_url}${pollingFileData?.payload?.genType}/${pollingFileData?.task_id}`;
        headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${klingCreateJWT(api.key.key, process.env.KLING_SECRET_KEY || '')}`,
        };
      } else if (api.poll_type === 'vidu') {
        endpoint = `${api?.poll_url}${pollingFileData?.task_id}/creations`;
        headers = {
          'Content-Type': 'application/json',
          Authorization: `Token ${api.key.key}`,
        };
      } else {
        headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api.key.key}`,
        };
      }
      break;
    default:
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api.key.key}`,
      };
  }

  const response = await axios
    .get(endpoint, {
      headers: headers,
      validateStatus: () => true,
    })
    .catch(async error => {
      console.log('error', JSON.stringify(error));
      await updateUserGeneration({
        id: pollingFileData.id,
        status: 'error',
        polling_response: error?.response?.data,
      });
      throw new Error(error.response?.data?.message || error.message || 'Failed to generate');
    });

  if (response.status < 200 || response.status >= 300) {
    console.error('Error in videoGenerationsEndpoint:', response.statusText);
    status = 'error';
    pollingFileResponse = {
      code: response.status,
      msg: response.statusText,
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

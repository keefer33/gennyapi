import axios, { AxiosResponse } from 'axios';
import { removeEmptyValues } from '../../utils/payloadUtils';

export const videoGenerations = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;
  console.log('endpoint', endpoint);
  console.log('api model name', taskObject.api.model_name);
  console.log('api key', taskObject.api.key.key);
  const rawPayload = {
    model: taskObject.api.model_name,
    ...taskObject.payload,
  };
  const cleanedPayload = removeEmptyValues(rawPayload);
  // Ensure payload is an object (not undefined) before sending
  const payload = cleanedPayload && typeof cleanedPayload === 'object' ? cleanedPayload : {};
  console.log('payload', payload);
  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${taskObject.api.key.key}`,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error));
      throw new Error(error.response?.data?.message || error.message || 'Failed to generate');
    });

  return { success: true, data: response.data, task_id: response.data.id };
};

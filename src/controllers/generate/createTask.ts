import axios, { AxiosResponse } from 'axios';
import { removeEmptyValues } from '../../utils/payloadUtils';


export const createTask = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;

  const inputModelName = taskObject.payload?.model_name || taskObject.api.model_name;
  const inputPayload = { ...(taskObject.payload || {}) };

  delete inputPayload?.model_name;
  const cleanedPayload = removeEmptyValues(inputPayload);

  const payload = {
    model: inputModelName,
    input: cleanedPayload,
  };
  console.log('payload', JSON.stringify(payload));
  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${taskObject.api.key.key}`,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error.response.data));

      throw new Error(error.message || 'Failed to generate');
    });

  if (response.data?.code !== 200) {
    console.error('Error creating task:', response.data);
    throw new Error(response.data?.msg || response.data?.message || 'Failed to generate');
  }
  return { success: true, data: response.data, task_id: response.data.data.taskId };
};

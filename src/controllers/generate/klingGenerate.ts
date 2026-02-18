import axios, { AxiosResponse } from 'axios';
import { klingCreateJWT } from '../../utils/klingCreateJWT';

export const klingGenerate = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;

  const payload = {
    model_name: taskObject.api.model_name,
    ...taskObject.payload,
  };

  if (Array.isArray(payload.image_list) && payload.image_list.length === 0) {
    delete payload.image_list;
  }

  const jwt = klingCreateJWT(taskObject.api.key.key, process.env.KLING_SECRET_KEY || '');
  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error));

      throw new Error(error?.message || 'Failed to generate');
    });

  return { success: true, data: response.data, task_id: response.data.data.task_id };
};

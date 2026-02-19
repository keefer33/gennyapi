import axios, { AxiosResponse } from 'axios';
import { klingCreateJWT } from '../../utils/klingCreateJWT';
import { ConsoleSpanExporter } from '@openai/agents';

export const klingGenerate = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;

  const payload = {
    model_name: taskObject.api.model_name,
    ...taskObject.payload,
  };
console.log('payload', payload);
  if (Array.isArray(payload.image_list)) {
    payload.image_list = payload.image_list.map((item: any) => {
      if (typeof item === 'string') {
        return { image_url: item };
      }

      if (item?.image_url) {
        return item;
      }

      return { image_url: item?.url || '' };
    });
  }

  if (Array.isArray(payload.image_list) && payload.image_list.length === 0) {
    delete payload.image_list;
  }

  const jwt = klingCreateJWT(taskObject.api.key.key, process.env.KLING_SECRET_KEY || '');
  console.log('jwt', jwt);
  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    })
    .catch(error => {
      console.log('error', error.response.data);

      throw new Error(error?.response?.data?.message || 'Failed to generate');
    });

  return { success: true, data: response.data, task_id: response.data.data.task_id };
};

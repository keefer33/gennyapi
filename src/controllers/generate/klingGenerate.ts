import axios, { AxiosResponse } from 'axios';
import { klingCreateJWT } from '../../utils/klingCreateJWT';

export const klingGenerate = async (taskObject: any) => {
  const endpoint = `${taskObject.api.api_url}${taskObject.payload.genType}`;
  //delete taskObject.payload.genType;
  const payload = taskObject.payload; 
console.log('payload', payload);

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

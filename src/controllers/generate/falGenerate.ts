import axios, { AxiosResponse } from 'axios';

export const falGenerate = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;
console.log('taskObject.payload', taskObject.payload);

  const response: AxiosResponse = await axios
    .post(endpoint, taskObject.payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${taskObject.api.key.key}`,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error.response.data));

      throw new Error(error.message || 'Failed to generate');
    });

  return { success: true, data: response.data, task_id: response.data.request_id };
};

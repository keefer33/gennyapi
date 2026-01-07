import axios, { AxiosResponse } from 'axios';

export const videoGenerations = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;
  console.log('endpoint', endpoint);
  console.log('api model name', taskObject.api.model_name);
  console.log('api key', taskObject.api.key.key);
  const payload = {
    model: taskObject.api.model_name,
    ...taskObject.payload,
  }
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

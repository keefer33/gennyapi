import axios, { AxiosResponse } from 'axios';

export const mergeVideos = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;
  console.log('endpoint', endpoint);
  console.log('payload', taskObject.payload);
  console.log('api key', taskObject.api.key.key);

  const response: AxiosResponse = await axios
    .post(endpoint, taskObject.payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': taskObject.api.key.key,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error));
      throw new Error(error.response?.data?.message || error.message || 'Failed to generate');
    });

  return { success: true, data: response.data, task_id: response.data.predictionID };
};

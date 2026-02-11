import axios, { AxiosResponse } from 'axios';

export const falGenerate = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;

  const response: AxiosResponse = await axios
    .post(endpoint, taskObject.payload, {
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
  return { success: true, data: response.data, task_id: response.data.request_id };
};

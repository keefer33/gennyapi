import axios, { AxiosResponse } from 'axios';

export const klingGenerate = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;
  const payload = {
    model_name: taskObject.api.model_name,
    ...taskObject.payload,
  };  
  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${taskObject.api.key.key}`,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error));

      throw new Error(error?.message || 'Failed to generate');
    });

  return { success: true, data: response.data, task_id: response.data.data.task_id };
};

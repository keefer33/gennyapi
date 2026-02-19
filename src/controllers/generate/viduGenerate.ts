import axios, { AxiosResponse } from 'axios';

export const viduGenerate = async (taskObject: any) => {
  const endpoint = `${taskObject.api.api_url}${taskObject.payload.genType}`;
  delete taskObject.payload.genType;
  const payload = taskObject.payload;  
  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${taskObject.api.key.key}`,
      },
    })
    .catch(error => {
      console.log('error', JSON.stringify(error));

      throw new Error(error?.message || 'Failed to generate');
    });

  return { success: true, data: response.data, task_id: response.data.task_id };
};

import axios, { AxiosResponse } from 'axios';
import { removeEmptyValues } from '../../utils/payloadUtils';


export const createTask = async (taskObject: any) => {
  const endpoint = taskObject.api.api_url;

  const inputModelName = taskObject.payload?.model_name || taskObject.api.model_name;
  const inputPayload = { ...(taskObject.payload || {}) };

  delete inputPayload?.model_name;
  const cleanedPayload = removeEmptyValues(inputPayload);

  let headers: any = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${taskObject.api.key.key}`,
  }
  let payload: any = {};
  switch(taskObject.api.poll_type){
    case 'wan':
      payload = {
        model: inputModelName,
        input: {},
      };
      if(cleanedPayload.prompt) {
        payload.input.prompt = cleanedPayload.prompt
        delete cleanedPayload.prompt;
      } 
      if(cleanedPayload.audio_url) {
        payload.input.audio_url = cleanedPayload.audio_url
        delete cleanedPayload.audio_url;
      } 
      if(cleanedPayload.img_url) {
        payload.input.img_url = cleanedPayload.img_url
        delete cleanedPayload.img_url;
      }
      if(cleanedPayload.first_frame_url) {
        payload.input.first_frame_url = cleanedPayload.first_frame_url
        delete cleanedPayload.first_frame_url;
      }
      if(cleanedPayload.last_frame_url) {
        payload.input.last_frame_url = cleanedPayload.last_frame_url
        delete cleanedPayload.last_frame_url;
      }
      if(cleanedPayload.reference_urls) {
        payload.input.reference_urls = cleanedPayload.reference_urls
        delete cleanedPayload.reference_urls;
      }
      payload.parameters = cleanedPayload;
      headers['X-DashScope-Async'] = 'enable';
      break;
    case 'kie':
      payload = {
        model: inputModelName,
        input: cleanedPayload,
      };
      break;
    default:
      payload = {
        model: inputModelName,
        input: cleanedPayload,
      };
      break;
  }


  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: headers,
    })
    .catch(error => {
      console.log('error', JSON.stringify(error.response.data));

      throw new Error(error.message || 'Failed to generate');
    });

  if (response.data?.code !== 200) {
    console.error('Error creating task:', response.data);
    throw new Error(response.data?.msg || response.data?.message || 'Failed to generate');
  }

  let task_id = response.data?.data?.taskId || response.data?.output?.task_id;
  return { success: true, data: response.data, task_id: task_id };
};

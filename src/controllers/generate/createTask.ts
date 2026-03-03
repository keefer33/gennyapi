import axios, { AxiosResponse } from 'axios';
import { removeEmptyValues } from '../../utils/payloadUtils';
import { toWanResolution } from '../../utils/generate';

const WAN_INPUT_FIELDS = [
  'prompt',
  'audio_url',
  'img_url',
  'first_frame_url',
  'last_frame_url',
  'reference_urls',
] as const;

const createWanPayload = (cleanedPayload: any, inputModelName: string) => {
  const input: Record<string, unknown> = {};
  for (const key of WAN_INPUT_FIELDS) {
    if (cleanedPayload[key] != null) {
      input[key] = cleanedPayload[key];
    }
  }

  const size = toWanResolution(
    cleanedPayload.resolution,
    cleanedPayload.aspect_ratio ?? cleanedPayload.aspectRatio
  );

  const parameters = { ...cleanedPayload };
  for (const key of WAN_INPUT_FIELDS) {
    delete parameters[key];
  }
  delete parameters.model_name;
  delete parameters.resolution;
  delete parameters.aspect_ratio;
  delete parameters.aspectRatio;
  parameters.size = size;

  return {
    model: inputModelName,
    input,
    parameters,
  };
};

const createKiePayload = (cleanedPayload: any, inputModelName: string) => {
  return {
    model: inputModelName,
    input: cleanedPayload,
  };
}

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
      payload = createWanPayload(cleanedPayload, inputModelName);
      headers['X-DashScope-Async'] = 'enable';
      break;
    case 'kie':
      payload = createKiePayload(cleanedPayload, inputModelName);
      break;
    default:
      payload = createKiePayload(cleanedPayload, inputModelName);
      break;
  }

  console.log('payload', JSON.stringify(payload));

  const response: AxiosResponse = await axios
    .post(endpoint, payload, {
      headers: headers,
    })
    .catch(error => {
      console.log('error', JSON.stringify(error.response.data));

      throw new Error(error.message || 'Failed to generate');
    });

  let task_id = response.data?.data?.taskId || response.data?.output?.task_id;
  return { success: true, data: response.data, task_id: task_id };
};

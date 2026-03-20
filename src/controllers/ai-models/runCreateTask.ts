import axios, { AxiosResponse } from 'axios';
import { removeEmptyValues } from '../../utils/payloadUtils';
import { toWanResolution } from '../../utils/generate';
import { klingCreateJWT } from '../../utils/klingCreateJWT';

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

  const size = toWanResolution(cleanedPayload.resolution, cleanedPayload.aspect_ratio ?? cleanedPayload.aspectRatio);

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
};

const createViduPayload = (cleanedPayload: any, inputModelName: string) => {
  const { genType, ...rest } = cleanedPayload;
  !rest.model && (rest.model = inputModelName);
  return { payload: rest, pathSuffix: genType ?? '' };
};

const createKlingPayload = (cleanedPayload: any) => {
  const { genType, ...rest } = cleanedPayload;
  return { payload: rest, pathSuffix: genType ?? '' };
};

const createFalPayload = (cleanedPayload: any) => cleanedPayload;

const createReplicatePayload = (cleanedPayload: any) => ({ input: cleanedPayload });

const createEachlabsPayload = (cleanedPayload: any) => cleanedPayload;

export const runCreateTask = async (model_name: string, payload: any, modelData: any, userId: string) => {
  let endpoint = process.env.ENDPOINT_CREATE_TASK || '';

  const cleanedPayload = removeEmptyValues(payload);

  let headers: any = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${modelData.api_id.vendor_key.key}`,
  };

  let sendPayload: any = {};
  switch (modelData.api_id.meta.poll_type) {
    case 'wan':
      sendPayload = createWanPayload(cleanedPayload, model_name);
      headers['X-DashScope-Async'] = 'enable';
      break;
    case 'kie':
      sendPayload = createKiePayload(cleanedPayload, model_name);
      break;
    case 'vidu': {
      const viduResult = createViduPayload(cleanedPayload, model_name);
      sendPayload = viduResult.payload;
      endpoint = `${endpoint}${viduResult.pathSuffix}`;
      headers.Authorization = `Token ${modelData.api_id.vendor_key.key}`;
      break;
    }
    case 'kling': {
      const klingResult = createKlingPayload(cleanedPayload);
      sendPayload = klingResult.payload;
      endpoint = `${endpoint}${klingResult.pathSuffix}`;
      headers.Authorization = `Bearer ${klingCreateJWT(modelData.api_id.vendor_key.key, process.env.KLING_SECRET_KEY || '')}`;
      break;
    }
    case 'fal':
      sendPayload = createFalPayload(cleanedPayload);
      headers.Authorization = `Key ${modelData.api_id.vendor_key.key}`;
      break;
    case 'replicate':
      sendPayload = createReplicatePayload(cleanedPayload);
      break;
    case 'eachlabs':
      sendPayload = createEachlabsPayload(cleanedPayload);
      headers = {
        'Content-Type': 'application/json',
        'X-API-Key': modelData.api_id.vendor_key.key,
      };
      break;
    default:
      sendPayload = createKiePayload(cleanedPayload, model_name);
      break;
  }

  const response: AxiosResponse = await axios
    .post(endpoint, sendPayload, {
      headers: headers,
    })
    .catch(error => {
      console.log('error', JSON.stringify(error.response.data));

      throw new Error(
        error.message ||
          'Failed to generate.  Please try again later.  If the problem persists, please contact support.'
      );
    });

  //kie = response.data?.data?.taskId, wan = response.data?.output?.task_id, vidu = response.data?.task_id
  //kling = response.data?.data?.task_id, ai/ml = response.data?.id, fal = response.data?.request_id
  //replicate = response.data?.id, eachlabs = response.data?.predictionID
  const task_id =
    response.data?.data?.taskId ||
    response.data?.data?.task_id ||
    response.data?.output?.task_id ||
    response.data?.task_id ||
    response.data?.request_id ||
    response.data?.id ||
    response.data?.predictionID;
  if (!task_id) {
    throw new Error('Failed to generate.  Please try again later.  If the problem persists, please contact support.');
  }

  return { success: true, data: response.data, task_id };
};

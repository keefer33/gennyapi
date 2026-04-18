import { updateUserGenModelRun } from '../database/user_gen_model_runs';
import { UserGenModelRuns } from '../database/types';
import { saveFileFromUrl } from './fileUtils';

export const failWebhookGeneration = async (
  pollingFileData: Pick<UserGenModelRuns, 'id'>,
  pollingFileResponse: unknown
): Promise<never> => {
  if (!pollingFileData.id) {
    throw new Error('failWebhookGeneration: missing user_gen_model_runs id');
  }
  await updateUserGenModelRun({
    id: pollingFileData.id,
    polling_response: pollingFileResponse,
    status: 'error',
  });
  const errCode =
    pollingFileResponse && typeof pollingFileResponse === 'object'
      ? (pollingFileResponse as { err_code?: unknown }).err_code
      : undefined;
  throw new Error(`API error: ${typeof errCode === 'string' ? errCode : 'unknown'}`);
};

export const processResponse = async (
  output: unknown,
  pollingFileData: UserGenModelRuns,
  pollingFileResponse: unknown
) => {
  if (Array.isArray(output)) {
    const files: unknown[] = [];
    for (let index = 0; index < output.length; index++) {
      const url = output[index];
      if (typeof url === 'string' && url.trim()) {
        try {
          const savedFile = await saveFileFromUrl(url.trim(), pollingFileData, pollingFileResponse);
          if (savedFile) files.push(savedFile);
        } catch (_error) {
          await failWebhookGeneration(pollingFileData, pollingFileResponse);
        }
      }
    }

    return { status: 'completed', files };
  }

  const fileUrl = typeof output === 'string' ? output : null;
  try {
    const savedFile = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
    if (savedFile) return { status: 'completed', files: [savedFile] };
  } catch (_error) {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  throw new Error('API error: unknown');
};

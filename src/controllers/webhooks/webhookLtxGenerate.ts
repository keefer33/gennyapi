import axios from 'axios';
import { getUserGeneration, updateUserGeneration, createUserGenerationFile } from '../../utils/getSupaData';
import { saveFileFromBuffer } from '../../utils/generate';

/** LTX API keeps connection open until video is ready; allow long wait in background. */
const LTX_BACKGROUND_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Runs the full LTX request: POST, buffer response, save to Zipline, update generation.
 * Called fire-and-forget from webhookLtxGenerate on first cron run (when duration is empty).
 */
const runLtxGeneration = async (pollingFileData: any): Promise<void> => {
  const generationId = pollingFileData.id;
  const api = pollingFileData.api_id;
  const payload = pollingFileData.payload;
  const endpoint = `${api.api_url}${payload.genType}`;

  try {
    const response = await axios
      .post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api.key.key}`,
        },
        responseType: 'arraybuffer',
        timeout: LTX_BACKGROUND_TIMEOUT_MS,
        validateStatus: () => true,
      })
      .catch(error => {
        console.log('error', error.response?.data);
        throw new Error(error?.response?.data?.message || 'Failed to generate');
      });

    const requestId = (response.headers as Record<string, string>)['x-request-id']?.trim() || null;

    console.log('response', response, response.data, response.status);
    if (response.status !== 200) {
      await updateUserGeneration({
        id: generationId,
        status: 'error',
        ...(requestId && { task_id: requestId }),
        polling_response: { status: response.status, error: 'LTX returned non-200' },
      });
      return;
    }

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const savedFile = await saveFileFromBuffer(buffer, 'generated.mp4', pollingFileData, {
      source: 'ltx',
      headers: response.headers as Record<string, string>,
    });

    await createUserGenerationFile({
      generation_id: generationId,
      file_id: savedFile.file_id,
    });

    await updateUserGeneration({
      id: generationId,
      status: 'completed',
      ...(requestId && { task_id: requestId }),
      polling_response: { file_url: savedFile.file_url },
    });
  } catch (error: any) {
    console.error('runLtxGeneration error:', error?.message ?? error);
    await updateUserGeneration({
      id: generationId,
      status: 'error',
      polling_response: {
        error: error?.message ?? 'LTX generation failed',
        stack: error?.stack,
      },
    }).catch(updateErr => console.error('Failed to update generation status:', updateErr));
  }
};

/**
 * LTX has no separate status API. On first run (duration empty) we start the generation
 * fire-and-forget; cron re-selects the row every 5s to update duration. Returns current DB status.
 */
export const webhookLtxGenerate = async (pollingFileData: any): Promise<string> => {
  if (pollingFileData.duration == null) {
    runLtxGeneration(pollingFileData);
  }
  return pollingFileData.status ?? 'pending';
};

import axios from 'axios';
import { getUserGeneration } from '../../utils/getSupaData';
import { updateUserGeneration } from '../../utils/getSupaData';
import { createUserGenerationFile } from '../../utils/getSupaData';
import { saveFileFromBuffer } from '../../utils/generate';

/** LTX API keeps connection open until video is ready; allow long wait in background. */
const LTX_BACKGROUND_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Runs the full LTX request in the background: POST, stream/buffer response, save to Zipline, update generation.
 * Called fire-and-forget from generate.ts so the user gets an immediate response.
 */
export const ltxGenerateBackground = async (generationId: string, taskObject: any): Promise<void> => {
  try {
    const pollingFileData = await getUserGeneration(generationId);
    const endpoint = `${taskObject.api.api_url}${taskObject.payload.genType}`;
    const payload = taskObject.payload;

    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${taskObject.api.key.key}`,
      },
      responseType: 'arraybuffer',
      timeout: LTX_BACKGROUND_TIMEOUT_MS,
      validateStatus: () => true,
    });

    const requestId = (response.headers as Record<string, string>)['x-request-id']?.trim() || null;

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
    const savedFile = await saveFileFromBuffer(
      buffer,
      'generated.mp4',
      pollingFileData,
      { source: 'ltx', headers: response.headers as Record<string, string> }
    );

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
    console.error('ltxGenerateBackground error:', error?.message ?? error);
    await updateUserGeneration({
      id: generationId,
      status: 'error',
      polling_response: {
        error: error?.message ?? 'LTX generation failed',
        stack: error?.stack,
      },
    }).catch((updateErr) => console.error('Failed to update generation status:', updateErr));
  }
};

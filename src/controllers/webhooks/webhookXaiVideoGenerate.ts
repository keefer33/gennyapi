/**
 * xAI video has no separate status API; the background job (xaiVideoGenerate) updates
 * the generation row when generation completes. Polling just returns the current DB status.
 */
export const webhookXaiVideoGenerate = async (pollingFileData: any): Promise<string> => {
  return pollingFileData.status ?? 'pending';
};

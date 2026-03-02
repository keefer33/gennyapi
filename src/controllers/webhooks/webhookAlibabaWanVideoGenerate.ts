/**
 * Alibaba Wan video has no separate status API; the background job (alibabaWanVideoGenerate)
 * updates the generation row when generation completes. Polling just returns the current DB status.
 */
export const webhookAlibabaWanVideoGenerate = async (pollingFileData: any): Promise<string> => {
  return pollingFileData.status ?? 'pending';
};

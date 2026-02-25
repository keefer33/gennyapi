/**
 * LTX has no separate status API; the background job (ltxGenerateBackground) updates
 * the generation row when the sync POST completes. Polling just returns the current DB status.
 */
export const webhookLtxGenerate = async (pollingFileData: any): Promise<string> => {
  return pollingFileData.status ?? 'pending';
};

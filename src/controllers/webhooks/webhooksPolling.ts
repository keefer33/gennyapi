import { Request, Response } from 'express';
import { getUserGeneration, getGenerationFileIds, updateUserGeneration } from '../../utils/getSupaData';
import { ensureThumbnailForUserFile } from '../../utils/generate';
import { webhookCreateTask } from './webhookCreateTask';
import { webhookCheckStatus } from './webhooksCheckStatus';
import { webhookImageInstantGeneration } from './webhookImageInstantGeneration';
import { webhookCustomApiGenerate } from './webhookCustomApiGenerate';
import { webhookLtxGenerate } from './webhookLtxGenerate';
import { webhookXaiVideoGenerate } from './webhookXaiVideoGenerate';
import { webhookAlibabaWanVideoGenerate } from './webhookAlibabaWanVideoGenerate';

export const webhooksPolling = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Polling webhook received:', req.body);
    const { id } = req.body;
    // Validate request body has required id
    if (!id) {
      console.error('Missing required id in request body');
      throw new Error('Missing required id in request body');
    }

    const pollingFileData = await getUserGeneration(id);

    // Process based on model API type
    console.log('data', pollingFileData);
    let status = 'pending';
    let pollingFileResponse: any = {};
    switch (pollingFileData.api_id.api_type) {
      case 'imageInstantGeneration':
        status = await webhookImageInstantGeneration(pollingFileData);
        break;
      case 'createTask':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookCreateTask(pollingFileData, pollingFileResponse);
        break;
      case 'customApiGenerate':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookCustomApiGenerate(pollingFileData, pollingFileResponse);
        break;
      case 'ltxGenerate': {
        status = await webhookLtxGenerate(pollingFileData);
        pollingFileResponse = pollingFileData.polling_response ?? {};
        // Trigger only selects status = 'pending'. Set back to pending while background is still
        // running so the job gets re-selected every 5s and we keep updating duration.
        if (status === 'processing' || status === 'pending') {
          // Re-fetch so we don't overwrite 'completed' if background just finished
          const fresh = await getUserGeneration(pollingFileData.id);
          if (fresh.status === 'completed' || fresh.status === 'error') {
            status = fresh.status;
            pollingFileResponse = fresh.polling_response ?? pollingFileResponse;
          } else {
            status = 'pending';
          }
        }
        break;
      }
      case 'xaiVideoGenerate': {
        status = await webhookXaiVideoGenerate(pollingFileData);
        pollingFileResponse = pollingFileData.polling_response ?? {};
        if (status === 'processing' || status === 'pending') {
          const fresh = await getUserGeneration(pollingFileData.id);
          if (fresh.status === 'completed' || fresh.status === 'error') {
            status = fresh.status;
            pollingFileResponse = fresh.polling_response ?? pollingFileResponse;
          } else {
            status = 'pending';
          }
        }
        if (status === 'completed') {
          const fileIds = await getGenerationFileIds(pollingFileData.id);
          for (const fileId of fileIds) {
            await ensureThumbnailForUserFile(fileId);
          }
        }
        break;
      }
      case 'alibabaWanVideoGenerate': {
        status = await webhookAlibabaWanVideoGenerate(pollingFileData);
        pollingFileResponse = pollingFileData.polling_response ?? {};
        if (status === 'processing' || status === 'pending') {
          const fresh = await getUserGeneration(pollingFileData.id);
          if (fresh.status === 'completed' || fresh.status === 'error') {
            status = fresh.status;
            pollingFileResponse = fresh.polling_response ?? pollingFileResponse;
          } else {
            status = 'pending';
          }
        }
        if (status === 'completed') {
          const fileIds = await getGenerationFileIds(pollingFileData.id);
          for (const fileId of fileIds) {
            await ensureThumbnailForUserFile(fileId);
          }
        }
        break;
      }
      default:
        console.warn('Unknown API type:', pollingFileData.api_id.api_type);
        break;
    }

    const duration = Math.floor((Date.now() - new Date(pollingFileData.created_at).getTime()) / 1000);
    await updateUserGeneration({
      id: pollingFileData.id,
      status: status,
      polling_response: pollingFileResponse,
      duration: duration,
    });

    console.log('Generation Status:', status);
    console.log('Generation Response:', pollingFileResponse);
    console.log('Generation Duration:', duration);

    // Return immediate success response to Supabase function
    res.status(200).json({
      success: true,
      message: 'Polling webhook received and processing started',
      timestamp: new Date().toISOString(),
      data: { id: req.body.id },
    });
  } catch (error) {
    console.error('Error processing polling webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
};

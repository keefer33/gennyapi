import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getUserGeneration, getGenerationFileIds, updateUserGeneration } from '../generate/generateData';
import { ensureThumbnailForUserFile } from '../generate/generateUtils';
import { webhookCreateTask } from './webhookCreateTask';
import { webhookCheckStatus } from './webhooksCheckStatus';
import { webhookImageInstantGeneration } from './webhookImageInstantGeneration';
import { webhookCustomApiGenerate } from './webhookCustomApiGenerate';
import { webhookLtxGenerate } from './webhookLtxGenerate';
import { webhookXaiVideoGenerate } from './webhookXaiVideoGenerate';
import { webhookAlibabaWanVideoGenerate } from './webhookAlibabaWanVideoGenerate';

export const webhooksPolling = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    if (!id) {
      throw badRequest('Missing required id in request body');
    }

    const pollingFileData = await getUserGeneration(id);
    if (!pollingFileData) {
      throw new AppError('Generation not found', {
        statusCode: 404,
        code: 'generation_not_found',
      });
    }

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

    sendOk(res, {
      message: 'Polling webhook received and processing started',
      timestamp: new Date().toISOString(),
      id: req.body.id,
    });
  } catch (error) {
    sendError(res, error);
  }
};

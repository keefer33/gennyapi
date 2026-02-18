import { Request, Response } from 'express';
import { getUserGeneration } from '../../utils/getSupaData';
import { webhookCreateTask } from './webhookCreateTask';
import { webhookVideoGenerations } from './webhookVideoGenerations';
import { webhookCheckStatus } from './webhooksCheckStatus';
import { updateUserGeneration } from '../../utils/getSupaData';
import { webhookMergeVideos } from './webhookMergeVideos';
import { webhookImageInstantGeneration } from './webhookImageInstantGeneration';
import { webhookCustomApiGenerate } from './webhookCustomApiGenerate';
import { webhookFalGenerate } from './webhookFalGenerate';
import { webhookPrediction } from './webhookPrediction';
import { webhookViduGenerate } from './webhookViduGenerate';
import { webhookKlingGenerate } from './webhookKlingGenerate';

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
      case 'videoGenerations':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookVideoGenerations(pollingFileData, pollingFileResponse);
        break;
      case 'mergeVideos':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookMergeVideos(pollingFileData, pollingFileResponse);
        break;
      case 'customApiGenerate':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookCustomApiGenerate(pollingFileData, pollingFileResponse);
        break;
      case 'falGenerate':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookFalGenerate(pollingFileData, pollingFileResponse);
        break;
      case 'prediction':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookPrediction(pollingFileData, pollingFileResponse);
        break;
      case 'viduGenerate':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookViduGenerate(pollingFileData, pollingFileResponse);
        break;
      case 'klingGenerate':
        pollingFileResponse = await webhookCheckStatus(pollingFileData);
        status = await webhookKlingGenerate(pollingFileData, pollingFileResponse);
        break;
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

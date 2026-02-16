import { Request, Response } from 'express';
import { createUserGeneration, getModel } from '../../utils/getSupaData';
import { createTask } from './createTask';
import { videoGenerations } from './videoGenerations';
import { mergeVideos } from './mergeVideos';
import { customApiGenerate } from './customApiGenerate';
import { falGenerate } from './falGenerate';
import { predictionGenerate } from './predictionGenerate';
import { calculateTokensUtil } from '../../utils/generate';

export const generate = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.method !== 'PATCH' && req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // User is already authenticated by middleware, get from request
    const user = (req as any).user;

    const body = req.body;
    const model = await getModel(body.model_id);
    let generationResponse: any = {};
    let taskObject: any = {
      user_id: user?.id,
      payload: body.payload,
      api: model.api,
    };

    switch (model?.api?.api_type) {
      case 'imageInstantGeneration':
        generationResponse = {
          data: {
            task_id: null,
          },
        };
        break;
      case 'videoGenerations':
        generationResponse = await videoGenerations(taskObject);
        break;
      case 'createTask': {
        generationResponse = await createTask(taskObject);
        break;
      }
      case 'mergeVideos':
        generationResponse = await mergeVideos(taskObject);
        break;
      case 'customApiGenerate':
        generationResponse = await customApiGenerate(taskObject);
        break;
        case 'falGenerate':
          generationResponse = await falGenerate(taskObject);
          break;
      case 'prediction':
        generationResponse = await predictionGenerate(taskObject);
        break;
      default:
        throw new Error('Invalid model');
    }

    const tokensCost = await calculateTokensUtil(body.payload, model?.api?.pricing);

    const userGeneration = await createUserGeneration({
      user_id: user?.id,
      payload: body.payload,
      response: generationResponse.data,
      status: 'pending',
      task_id: generationResponse.task_id || null,
      model_id: model.id,
      generation_type: model.generation_type,
      api_id: model.api.id,
      cost: tokensCost,
    });

    res.status(200).json({ success: true, data: userGeneration });
  } catch (error) {
    console.error('Error generating:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate' });
  }
};

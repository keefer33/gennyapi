import { Request, Response } from 'express';
import { createUserGeneration, getModel } from './generateData';
import { createTask } from './createTask';
import { customApiGenerate } from './customApiGenerate';
import { calculatePricingUtil } from '../../utils/generate';
import { xaiVideoGenerate } from './xaiVideoGenerate';
import { alibabaWanVideoGenerate } from './alibabaWanVideoGenerate';
import { randomUUID } from 'crypto';

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
      case 'createTask': {
        generationResponse = await createTask(taskObject);
        break;
      }
      case 'customApiGenerate':
        generationResponse = await customApiGenerate(taskObject);
        break;
      case 'ltxGenerate':
        generationResponse = {
          data: {
            task_id: randomUUID(),
          },
        };
        break;
      case 'xaiVideoGenerate': {
        const costXai = await calculatePricingUtil(body.payload, model?.api?.pricing);
        const userGenerationXai = await createUserGeneration({
          user_id: user?.id,
          payload: body.payload,
          response: {},
          status: 'pending',
          task_id: randomUUID(),
          model_id: model.id,
          generation_type: model.generation_type,
          api_id: model.api.id,
          cost: costXai,
          usage_amount: costXai,
        });
        xaiVideoGenerate(userGenerationXai.id, taskObject);
        res.status(200).json({ success: true, data: userGenerationXai });
        return;
      }
      case 'alibabaWanVideoGenerate': {
        const costWan = await calculatePricingUtil(body.payload, model?.api?.pricing);
        const userGenerationWan = await createUserGeneration({
          user_id: user?.id,
          payload: body.payload,
          response: {},
          status: 'pending',
          task_id: randomUUID(),
          model_id: model.id,
          generation_type: model.generation_type,
          api_id: model.api.id,
          cost: costWan,
          usage_amount: costWan,
        });
        alibabaWanVideoGenerate(userGenerationWan.id, taskObject);
        res.status(200).json({ success: true, data: userGenerationWan });
        return;
      }
      default:
        throw new Error('Invalid model');
    }

    const cost = await calculatePricingUtil(body.payload, model?.api?.pricing);

    const userGeneration = await createUserGeneration({
      user_id: user?.id,
      payload: body.payload,
      response: generationResponse.data,
      status: 'pending',
      task_id: generationResponse.task_id || null,
      model_id: model.id,
      generation_type: model.generation_type,
      api_id: model.api.id,
      cost,
      usage_amount: cost,
    });

    res.status(200).json({ success: true, data: userGeneration });
  } catch (error) {
    console.error('Error generating:', error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate' });
  }
};

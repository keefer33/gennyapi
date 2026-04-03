import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { createUserGeneration, getModel } from './generateData';
import { createTask } from './createTask';
import { customApiGenerate } from './customApiGenerate';
import { calculatePricingUtil } from './generateUtils';
import { xaiVideoGenerate } from './xaiVideoGenerate';
import { alibabaWanVideoGenerate } from './alibabaWanVideoGenerate';
import { randomUUID } from 'crypto';
import { getAuthUserId } from '../../shared/getAuthUserId';

export const generate = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.method !== 'PATCH' && req.method !== 'POST') {
      throw new AppError('Method not allowed', {
        statusCode: 405,
        code: 'method_not_allowed',
      });
    }

    const userId = getAuthUserId(req);

    const body = req.body;
    if (!body?.model_id) {
      throw badRequest('model_id is required');
    }
    const model = await getModel(body.model_id);
    if (!model) {
      throw badRequest('Invalid model');
    }
    let generationResponse: any = {};
    let taskObject: any = {
      user_id: userId,
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
          user_id: userId,
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
        sendOk(res, userGenerationXai);
        return;
      }
      case 'alibabaWanVideoGenerate': {
        const costWan = await calculatePricingUtil(body.payload, model?.api?.pricing);
        const userGenerationWan = await createUserGeneration({
          user_id: userId,
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
        sendOk(res, userGenerationWan);
        return;
      }
      default:
        throw badRequest('Invalid model');
    }

    const cost = await calculatePricingUtil(body.payload, model?.api?.pricing);

    const userGeneration = await createUserGeneration({
      user_id: userId,
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

    sendOk(res, userGeneration);
  } catch (error) {
    sendError(res, error);
  }
};

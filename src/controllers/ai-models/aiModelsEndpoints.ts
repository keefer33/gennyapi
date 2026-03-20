import { Request, Response } from 'express';
import { aiModelByNameData, getAiModelsData } from './aiModelsData';
import { getUserId } from '../../utils/utils';
import { runCreateTask } from './runCreateTask';
import { calculatePricingUtil } from '../../utils/generate';
import { createNewUserGeneration } from '../../utils/getSupaData';
import { randomUUID } from 'crypto';

export const getAiModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getAiModelsData();
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.data);
  } catch (err) {
    console.error('[getAiModels] Error:', err);
    res.status(500).json({ error: 'Failed to get AI models' });
  }
};

export const searchAiModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const modelName = String(req.body.model_name ?? '').trim();
    const brandName = String(req.body.brand_name ?? '').trim();
    const modelType = String(req.body.model_type ?? '').trim();

    if (modelName) {
      const result = await aiModelByNameData(modelName);
      if (result.error) {
        res.status(404).json({ error: 'AI model not found' });
        return;
      }
      res.json(result.data);
      return;
    }

    const result = await getAiModelsData();
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    const all = Array.isArray(result.data) ? result.data : [];

    const filtered = all.filter((m: any) => {
      const byBrand = brandName ? String(m?.brand_name?.name ?? '').trim() === brandName : true;
      const byType = modelType ? String(m?.model_type ?? '').trim() === modelType : true;
      return byBrand && byType;
    });

    res.json(filtered);
  } catch (err) {
    console.error('[searchAiModels] Error:', err);
    res.status(500).json({ error: 'Failed to search AI models' });
  }
};

export const runAiModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const body = req.body || {};
    const { model_name, payload } = body;
    if (!model_name || typeof model_name !== 'string') {
      res.status(400).json({ error: 'model_name is required' });
      return;
    }
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'payload is required' });
      return;
    }
    const result = await aiModelByNameData(model_name);
    if (result.error || !result.data) {
      res.status(404).json({ error: 'AI model not found' });
      return;
    }

    let generation: any = {};
    //make a switch statement to call a different function based on the api_type of the model
    switch (result.data?.api_id?.api_type) {
      case 'createTask': {
        generation = await runCreateTask(model_name, payload, result.data, userId);
        break;
      }
      case 'ltxGenerate':
        generation = {
          data: {
            status: "started",
          },
          task_id: randomUUID(),
        };
        break;
      default:
        throw new Error('Invalid model');
    }

    const cost = await calculatePricingUtil(payload, result.data.api_id.pricing);

    const userGeneration = await createNewUserGeneration({
      user_id: userId,
      payload: payload,
      response: generation.data,
      status: 'pending',
      task_id: generation.task_id || null,
      model_id: result.data.id,
      generation_type: result.data.model_type,
      api_id: result.data.api_id.id,
      usage_amount: cost,
    });
    res.status(200).json({ success: true, data: userGeneration });
  } catch (err) {
    console.error('[runAiModel] Error:', err);
    res.status(500).json({ error: 'Failed to run AI model' });
  }
};

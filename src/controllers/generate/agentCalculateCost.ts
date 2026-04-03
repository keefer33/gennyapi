import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { calculatePricingUtil } from './generateUtils';
import { fetchGenerationModelByName } from './generateData';

/**
 * POST body: { formValues: object, toolName: string }
 * `toolName` must match `models.name`; pricing is read from joined `api.pricing`.
 */
export const agentCalculateCost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { formValues, toolName } = req.body ?? {};

    if (typeof toolName !== 'string' || !toolName.trim()) {
      throw badRequest('toolName is required');
    }

    const model = await fetchGenerationModelByName(toolName);
    if (!model) {
      throw new AppError('No model found for that name', {
        statusCode: 404,
        code: 'generation_model_not_found',
      });
    }

    const pricing = model.api?.pricing;
    if (pricing == null || typeof pricing !== 'object') {
      throw new AppError('No pricing configured for this model', {
        statusCode: 422,
        code: 'generation_model_pricing_missing',
      });
    }

    const cost = await calculatePricingUtil(formValues ?? {}, pricing);
    if (typeof cost !== 'number' || Number.isNaN(cost) || !Number.isFinite(cost)) {
      throw new AppError('Failed to calculate model cost', {
        statusCode: 500,
        code: 'generation_model_cost_invalid',
      });
    }

    sendOk(res, {
      cost,
      model_id: model.id,
      toolName: toolName.trim(),
    });
  } catch (error: unknown) {
    sendError(res, error);
  }
};

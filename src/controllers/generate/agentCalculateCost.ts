import { Request, Response } from 'express';
import { calculatePricingUtil } from '../../utils/generate';
import { fetchGenerationModelByName } from './generateData';

/**
 * POST body: { formValues: object, toolName: string }
 * `toolName` must match `models.name`; pricing is read from joined `api.pricing`.
 */
export const agentCalculateCost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { formValues, toolName } = req.body ?? {};

    if (typeof toolName !== 'string' || !toolName.trim()) {
      res.status(400).json({
        success: false,
        error: 'toolName is required',
        data: { cost: 0 },
      });
      return;
    }

    const model = await fetchGenerationModelByName(toolName);
    if (!model) {
      res.status(404).json({
        success: false,
        error: 'No model found for that name',
        data: { cost: 0 },
      });
      return;
    }

    const pricing = model.api?.pricing;
    if (pricing == null || typeof pricing !== 'object') {
      res.status(200).json({
        success: true,
        data: {
          cost: 0,
          model_id: model.id,
          toolName: toolName.trim(),
          message: 'No pricing configured for this model',
        },
      });
      return;
    }

    const cost = await calculatePricingUtil(formValues ?? {}, pricing);
    res.status(200).json({
      success: true,
      data: {
        cost,
        model_id: model.id,
        toolName: toolName.trim(),
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[agentCalculateCost]', err?.message ?? error);
    res.status(500).json({
      success: false,
      error: err?.message ?? 'Failed to calculate cost',
      data: { cost: 0 },
    });
  }
};

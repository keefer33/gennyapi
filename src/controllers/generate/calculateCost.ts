import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { calculatePricingUtil } from './generateUtils';

export const calculateCost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { formValues, pricing } = req.body ?? {};
    const cost = await calculatePricingUtil(formValues ?? {}, pricing ?? {});
    sendOk(res, { cost });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to calculate cost';
    sendError(
      res,
      new AppError(message, {
        statusCode: 500,
        code: 'generation_cost_calculation_failed',
      })
    );
  }
};

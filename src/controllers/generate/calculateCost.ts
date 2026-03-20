import { Request, Response } from 'express';
import { calculatePricingUtil } from '../../utils/generate';

export const calculateCost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { formValues, pricing } = req.body ?? {};
    const cost = await calculatePricingUtil(formValues ?? {}, pricing ?? {});
    res.status(200).json({
      success: true,
      data: { cost },
    });
  } catch (error: any) {
    console.error('[calculateTokens] Error:', error?.message ?? error);
    res.status(500).json({
      success: false,
      error: error?.message ?? 'Failed to calculate cost',
      data: { cost: 0 },
    });
  }
};

import { Request, Response } from 'express';
import { calculateTokensUtil } from '../../utils/generate';

export const calculateTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { formValues, pricing } = req.body ?? {};
    const tokensCost = await calculateTokensUtil(formValues ?? {}, pricing ?? {});
    res.status(200).json({
      success: true,
      data: { tokensCost },
    });
  } catch (error: any) {
    console.error('[calculateTokens] Error:', error?.message ?? error);
    res.status(500).json({
      success: false,
      error: error?.message ?? 'Failed to calculate tokens',
      data: { tokensCost: 0 },
    });
  }
};

import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { USAGE_LOG_TYPE_PROMO_CREDIT } from '../../database/const';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { createUserProfile } from '../../database/user_profiles';
import { getPromotionByCode } from '../../database/promotions';

function parsePromoDollarAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.method !== 'POST') {
      throw new AppError('Method not allowed', {
        statusCode: 405,
        code: 'method_not_allowed',
      });
    }

    const { user_id, zipline, username, email } = req.body ?? {};
    if (!user_id || !username || !email) {
      throw badRequest('user_id, username, and email are required');
    }

    const promotion = await getPromotionByCode('NEWUSER');

    let promotionId: string | null = null;
    let usageBalance = 5;
    const promoDollars = promotion ? parsePromoDollarAmount(promotion.dollar_amount) : null;
    if (promotion && promoDollars != null) {
      const isActive =
        (!promotion.start_date || new Date(promotion.start_date) <= new Date()) &&
        (!promotion.end_date || new Date(promotion.end_date) >= new Date());

      if (isActive) {
        promotionId = promotion.id;
        usageBalance = promoDollars;
      }
    }

    const data = await createUserProfile({
      user_id,
      zipline,
      username,
      email,
      usage_balance: usageBalance,
    });

    const usageLog = await insertUserUsageLog({
      user_id,
      usage_amount: usageBalance,
      type_id: USAGE_LOG_TYPE_PROMO_CREDIT,
      gen_model_run_id: null,
      transaction_id: null,
      meta: {
        promotion_id: promotionId,
      },
    });

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};

import type { Request, Response } from 'express';
import { getServerClient } from '../../utils/supabaseClient';

/**
 * GET /promotions
 * Public list of promotions that are currently active:
 * - start_date is null OR start_date <= now
 * - end_date is null OR end_date >= now
 */
export async function listActivePromotions(req: Request, res: Response): Promise<void> {
  try {
    const { supabaseServerClient } = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[listActivePromotions]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const now = new Date().toISOString();
    const nowDate = new Date(now);

    const activePromotions = (data ?? []).filter((promo: Record<string, unknown>) => {
      const startDate = promo.start_date ? new Date(String(promo.start_date)) : null;
      const endDate = promo.end_date ? new Date(String(promo.end_date)) : null;

      const isStarted = !startDate || startDate <= nowDate;
      const isNotEnded = !endDate || endDate >= nowDate;

      return isStarted && isNotEnded;
    });

    res.status(200).json({ success: true, data: { promotions: activePromotions } });
  } catch (err) {
    console.error('[listActivePromotions]', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch promotions',
    });
  }
}

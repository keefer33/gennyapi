import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getServerClient } from '../../database/supabaseClient';

export type BrandRow = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

export async function getBrands(req: Request, res: Response): Promise<void> {
  try {
    const { supabaseServerClient } = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('brands')
      .select('id, name, slug, logo')
      .neq('name', 'Genny.bot')
      .order('name', { ascending: true });

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'brands_fetch_failed',
      });
    }

    sendOk(res, (data ?? []) as BrandRow[]);
  } catch (err) {
    sendError(res, err);
  }
}

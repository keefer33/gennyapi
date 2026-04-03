import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

/** GET /user/tags */
export async function listUserTags(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_tags')
      .select('*')
      .eq('user_id', userId)
      .order('tag_name', { ascending: true });

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_tags_list_failed',
      });
    }

    sendOk(res, { tags: data ?? [] });
  } catch (error) {
    sendError(res, error);
  }
}

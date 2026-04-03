import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

/** PATCH /user/tags/:tagId — body: { tag_name: string } */
export async function updateUserTag(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tagId = req.params.tagId;
    const tagName = typeof req.body?.tag_name === 'string' ? req.body.tag_name.trim() : '';
    if (!tagId || !tagName) {
      throw badRequest('tagId and tag_name are required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_tags')
      .update({ tag_name: tagName })
      .eq('id', tagId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_tag_update_failed',
      });
    }

    if (!data) {
      throw notFound('Tag not found');
    }

    sendOk(res, { tag: data });
  } catch (error) {
    sendError(res, error);
  }
}

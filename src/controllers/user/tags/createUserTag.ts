import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

/** POST /user/tags — body: { tag_name: string } */
export async function createUserTag(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tagName = typeof req.body?.tag_name === 'string' ? req.body.tag_name.trim() : '';
    if (!tagName) {
      throw badRequest('tag_name is required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_tags')
      .insert({ user_id: userId, tag_name: tagName })
      .select()
      .single();

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_tag_create_failed',
      });
    }

    sendOk(res, { tag: data }, 201);
  } catch (error) {
    sendError(res, error);
  }
}

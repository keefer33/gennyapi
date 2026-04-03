import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

/** DELETE /user/tags/:tagId */
export async function deleteUserTag(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tagId = req.params.tagId;
    if (!tagId) {
      throw badRequest('Missing tag id');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { error } = await supabaseServerClient.from('user_tags').delete().eq('id', tagId).eq('user_id', userId);

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_tag_delete_failed',
      });
    }

    sendOk(res, true);
  } catch (error) {
    sendError(res, error);
  }
}

import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

/** POST /user/tags/file-links — body: { file_id: string, tag_id: string } */
export async function addTagToFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const file_id = typeof req.body?.file_id === 'string' ? req.body.file_id : '';
    const tag_id = typeof req.body?.tag_id === 'string' ? req.body.tag_id : '';
    if (!file_id || !tag_id) {
      throw badRequest('file_id and tag_id are required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: fileRow, error: fileErr } = await supabaseServerClient
      .from('user_files')
      .select('id')
      .eq('id', file_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fileErr) {
      throw new AppError(fileErr.message, {
        statusCode: 500,
        code: 'user_file_lookup_failed',
      });
    }
    if (!fileRow) {
      throw notFound('File not found');
    }

    const { data: tagRow, error: tagErr } = await supabaseServerClient
      .from('user_tags')
      .select('id')
      .eq('id', tag_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (tagErr) {
      throw new AppError(tagErr.message, {
        statusCode: 500,
        code: 'user_tag_lookup_failed',
      });
    }
    if (!tagRow) {
      throw notFound('Tag not found');
    }

    const { error } = await supabaseServerClient.from('user_file_tags').insert({
      file_id,
      tag_id,
    });

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_file_tag_link_create_failed',
      });
    }

    sendOk(res, true, 201);
  } catch (error) {
    sendError(res, error);
  }
}

import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../database/supabaseClient';

const FILE_TAG_SELECT = `
  file_id,
  tag_id,
  created_at,
  user_tags(*)
`;

/** GET /user/tags/files/:fileId */
export async function getFileTags(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const fileId = req.params.fileId;
    if (!fileId) {
      throw badRequest('Missing file id');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: fileRow, error: fileErr } = await supabaseServerClient
      .from('user_files')
      .select('id')
      .eq('id', fileId)
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

    const { data, error } = await supabaseServerClient
      .from('user_file_tags')
      .select(FILE_TAG_SELECT)
      .eq('file_id', fileId);

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_file_tags_fetch_failed',
      });
    }

    sendOk(res, { tags: data ?? [] });
  } catch (error) {
    sendError(res, error);
  }
}

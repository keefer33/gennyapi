import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

const FILE_SELECT = `
  *,
  user_file_tags(
    tag_id,
    created_at,
    user_tags(*)
  )
`;

/**
 * GET /user/files/by-path?file_path=<encoded url or path>
 * Returns one active user file owned by the JWT user matching `file_path`.
 */
export async function getUserFileByPath(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const raw = req.query.file_path;
    const filePath = typeof raw === 'string' ? raw.trim() : '';
    if (!filePath) {
      throw badRequest('file_path query parameter is required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_files')
      .select(FILE_SELECT)
      .eq('user_id', userId)
      .eq('file_path', filePath)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_file_by_path_fetch_failed',
      });
    }

    if (!data) {
      throw notFound('File not found');
    }

    sendOk(res, { file: data });
  } catch (error) {
    sendError(res, error);
  }
}

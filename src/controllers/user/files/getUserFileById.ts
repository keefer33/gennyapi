import type { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../database/supabaseClient';

const FILE_SELECT = `
  *,
  user_file_tags(
    tag_id,
    created_at,
    user_tags(*)
  )
`;

/**
 * GET /user/files/:fileId — one active file owned by the JWT user (same shape as by-path).
 */
export async function getUserFileById(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const fileId = typeof req.params.fileId === 'string' ? req.params.fileId.trim() : '';
    if (!fileId) {
      throw badRequest('Missing file id');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_files')
      .select(FILE_SELECT)
      .eq('id', fileId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_file_by_id_fetch_failed',
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

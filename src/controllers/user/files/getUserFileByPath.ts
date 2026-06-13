import { Request, Response } from 'express';
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

async function fetchActiveUserFileByUrl(
  supabaseServerClient: SupabaseServerClients['supabaseServerClient'],
  userId: string,
  url: string
) {
  const buildQuery = () =>
    supabaseServerClient
      .from('user_files')
      .select(FILE_SELECT)
      .eq('user_id', userId)
      .eq('status', 'active');

  const { data: byPath, error: pathError } = await buildQuery().eq('file_path', url).maybeSingle();
  if (pathError) {
    throw new AppError(pathError.message, {
      statusCode: 500,
      code: 'user_file_by_path_fetch_failed',
    });
  }
  if (byPath) return byPath;

  const { data: byThumbnail, error: thumbError } = await buildQuery().eq('thumbnail_url', url).maybeSingle();
  if (thumbError) {
    throw new AppError(thumbError.message, {
      statusCode: 500,
      code: 'user_file_by_thumbnail_fetch_failed',
    });
  }
  return byThumbnail;
}

/**
 * GET /user/files/by-path?file_path=<encoded url or path>
 * Returns one active user file owned by the JWT user matching `file_path` or `thumbnail_url`.
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

    const data = await fetchActiveUserFileByUrl(supabaseServerClient, userId, filePath);

    if (!data) {
      throw notFound('File not found');
    }

    sendOk(res, { file: data });
  } catch (error) {
    sendError(res, error);
  }
}

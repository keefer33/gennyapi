import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

/**
 * POST /user/files
 * Body: { file_name, file_path, file_size, file_type, upload_type?: string }
 * Inserts a user_files row after a successful Zipline upload (if not using POST /user/files/upload).
 */
export async function createUserFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const { file_name, file_path, file_size, file_type, upload_type } = req.body ?? {};

    if (
      typeof file_name !== 'string' ||
      typeof file_path !== 'string' ||
      typeof file_size !== 'number' ||
      typeof file_type !== 'string'
    ) {
      throw badRequest('file_name, file_path, file_size, and file_type are required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_files')
      .insert({
        user_id: userId,
        file_name,
        file_path,
        file_size,
        file_type,
        status: 'active',
        upload_type: typeof upload_type === 'string' ? upload_type : 'upload',
      })
      .select()
      .single();

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_file_create_failed',
      });
    }

    sendOk(res, data, 201);
  } catch (error) {
    sendError(res, error);
  }
}

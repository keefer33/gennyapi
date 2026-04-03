import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';

/**
 * PATCH /user/files/:fileId
 * Body: { file_name: string } — display name; extension appended if missing (matches client behavior)
 */
export async function updateUserFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const fileId = req.params.fileId;
    const { file_name: newFileName } = req.body ?? {};

    if (!fileId) {
      throw badRequest('Missing file id');
    }

    if (typeof newFileName !== 'string' || !newFileName.trim()) {
      throw badRequest('file_name is required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: currentFile, error: fetchError } = await supabaseServerClient
      .from('user_files')
      .select('file_path, file_name')
      .eq('id', fileId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (fetchError || !currentFile) {
      throw notFound('File not found');
    }

    const fileExtension = currentFile.file_name.split('.').pop() || '';
    const newFileNameWithExtension = newFileName.includes('.') ? newFileName : `${newFileName}.${fileExtension}`;

    const { data: updatedFile, error: updateError } = await supabaseServerClient
      .from('user_files')
      .update({ file_name: newFileNameWithExtension })
      .eq('id', fileId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      throw new AppError(updateError.message, {
        statusCode: 500,
        code: 'user_file_update_failed',
      });
    }

    sendOk(res, updatedFile);
  } catch (error) {
    sendError(res, error);
  }
}

import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getServerClient, SupabaseServerClients } from '../../database/supabaseClient';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * DELETE /generations/:generationId
 */
export async function deleteUserGeneration(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const generationId = req.params.generationId;
    if (!generationId) {
      throw badRequest('Missing generation id');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { error } = await supabaseServerClient
      .from('user_generations')
      .delete()
      .eq('id', generationId)
      .eq('user_id', userId);

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'generation_delete_failed',
      });
    }

    sendOk(res, true);
  } catch (error) {
    sendError(res, error);
  }
}

import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { USER_GENERATION_SELECT } from './generationSelect';

/**
 * GET /generations/:generationId
 */
export async function getUserGeneration(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const generationId = req.params.generationId;
    if (!generationId) {
      throw badRequest('Missing generation id');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_generations')
      .select(USER_GENERATION_SELECT)
      .eq('id', generationId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw notFound(error.message);
      }
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'generation_get_failed',
      });
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
}

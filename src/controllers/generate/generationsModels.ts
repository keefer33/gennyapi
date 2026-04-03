import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { fetchGenerationModelsFromDb } from './generateData';
import { GenerationModel } from './generateTypes';

export const getGenerationModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const models = (await fetchGenerationModelsFromDb()) as GenerationModel[];
    sendOk(res, models);
  } catch (error) {
    sendError(
      res,
      new AppError('Error fetching models', {
        statusCode: 500,
        code: 'generation_models_fetch_failed',
      })
    );
  }
};

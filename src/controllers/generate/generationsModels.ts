import { Request, Response } from 'express';
import { fetchGenerationModelsFromDb, type GenerationModel } from './generateData';

export const getGenerationModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const models = (await fetchGenerationModelsFromDb()) as GenerationModel[];
    res.status(200).json({
      success: true,
      data: models,
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching models',
    });
  }
};

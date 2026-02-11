import { Request, Response } from 'express';
import axios from 'axios';

export const getAiGatewayModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const response = await axios.get('https://ai-gateway.vercel.sh/v1/models');
    res.json(response.data);
  } catch (error) {
    console.error('[getAiGatewayModels] Error fetching models:', error);
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data || 'Failed to fetch models' 
      });
    } else {
      res.status(500).json({ error: 'Failed to fetch models' });
    }
  }
};

import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import {
  getAgentModelsData,
} from '../../database/agent_models';
import { AgentModelRow } from '../../database/types';

export const getAgentModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const result: AgentModelRow[] = await getAgentModelsData();
    sendOk(res, result);
  } catch (err) {
    sendError(res, err);
  }
};

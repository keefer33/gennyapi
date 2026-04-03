import type { Request, Response } from 'express';
import { CreateUserAgentBody, UpdateUserAgentBody } from './agentsTypes';
import { AppError } from '../../app/error';
import { badRequest, notFound, sendError, sendNoContent, sendOk } from '../../app/response';
import {
  getAgentModelsData,
  handleCreateUserAgent,
  handleListUserAgents,
  handleGetUserAgent,
  handleUpdateUserAgent,
  handleDeleteUserAgent,
} from './agentsData';
import { getAuthUserId } from '../../shared/getAuthUserId';

export const getAgentModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getAgentModelsData();
    if (result.error) {
      throw new AppError(result.error, {
        statusCode: 400,
        code: 'agent_models_fetch_failed',
      });
      return;
    }
    sendOk(res, result.data);
  } catch (err) {
    sendError(res, err);
  }
};

export const createUserAgent = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { name, model_name, config } = req.body as CreateUserAgentBody;

    if (!name || typeof name !== 'string') {
      throw badRequest('name is required');
    }
    if (!model_name) {
      throw badRequest('model_name is required');
    }

    const result = await handleCreateUserAgent(userId, {
      name: name.trim(),
      model_name,
      config: config ?? null,
    });
    if (result.error) {
      throw badRequest(result.error);
    }
    sendOk(res, result.data, 201);
  } catch (err) {
    sendError(res, err);
  }
};

export const listUserAgents = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const result = await handleListUserAgents(userId);
    if (result.error) {
      throw badRequest(result.error);
    }
    sendOk(res, result.data ?? []);
  } catch (err) {
    sendError(res, err);
  }
};

export const getUserAgent = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { agent_id } = req.params;
    if (!agent_id) {
      throw badRequest('agent_id is required');
    }
    const result = await handleGetUserAgent(userId, agent_id);
    if (result.error) {
      throw notFound(result.error);
    }
    sendOk(res, result.data);
  } catch (err) {
    sendError(res, err);
  }
};

export const updateUserAgent = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { agent_id } = req.params;
    if (!agent_id) {
      throw badRequest('agent_id is required');
    }

    const { name, model_name, config } = req.body as UpdateUserAgentBody;

    const result = await handleUpdateUserAgent(userId, agent_id, {
      name,
      model_name,
      config: config ?? null,
    });
    if (result.error) {
      if (result.error === 'Agent not found') {
        throw notFound(result.error);
      }
      throw badRequest(result.error);
    }
    sendOk(res, result.data);
  } catch (err) {
    sendError(res, err);
  }
};

export const deleteUserAgent = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { agent_id } = req.params;
    if (!agent_id) {
      throw badRequest('agent_id is required');
    }
    const result = await handleDeleteUserAgent(userId, agent_id);
    if (result.error) {
      throw badRequest(result.error);
    }
    sendNoContent(res);
  } catch (err) {
    sendError(res, err);
  }
};

import type { Request, Response } from 'express';
import {
  getAgentModelsData,
  handleCreateUserAgent,
  handleListUserAgents,
  handleGetUserAgent,
  handleUpdateUserAgent,
  handleDeleteUserAgent,
} from './agentsData';

function getUserId(req: Request): string {
  const user = (req as any).user;
  if (!user?.id) throw new Error('Unauthorized');
  return user.id;
}

export const getAgentModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getAgentModelsData();
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.data);
  } catch (err) {
    console.error('[getAgentModels] Error:', err);
    res.status(500).json({ error: 'Failed to get Agent models' });
  }
};

export const createUserAgent = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { name, model_name, config } = req.body as {
    name?: string;
    model_name?: string;
    config?: Record<string, unknown>;
  };

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!model_name) {
    res.status(400).json({ error: 'model_name is required' });
    return;
  }

  const result = await handleCreateUserAgent(userId, {
    name: name.trim(),
    model_name,
    config: config ?? null,
  });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json(result.data);
};

export const listUserAgents = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const result = await handleListUserAgents(userId);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data ?? []);
};

export const getUserAgent = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { agent_id } = req.params;
  if (!agent_id) {
    res.status(400).json({ error: 'agent_id is required' });
    return;
  }
  const result = await handleGetUserAgent(userId, agent_id);
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(result.data);
};

export const updateUserAgent = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { agent_id } = req.params;
  if (!agent_id) {
    res.status(400).json({ error: 'agent_id is required' });
    return;
  }

  const { name, model_name, config } = req.body as {
    name?: string;
    model_name?: string;
    config?: Record<string, unknown> | null;
  };

  const result = await handleUpdateUserAgent(userId, agent_id, {
    name,
    model_name,
    config: config ?? null,
  });
  if (result.error) {
    const status = result.error === 'Agent not found' ? 404 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json(result.data);
};

export const deleteUserAgent = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { agent_id } = req.params;
  if (!agent_id) {
    res.status(400).json({ error: 'agent_id is required' });
    return;
  }
  const result = await handleDeleteUserAgent(userId, agent_id);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(204).send();
};

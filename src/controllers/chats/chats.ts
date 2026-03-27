import { Request, Response } from 'express';
import {
  handleCreateChat,
  handleListChats,
  handleGetChat,
  handleUpdateChat,
  handleDeleteChat,
  handleListChatMessages,
  handleCreateChatMessage,
  handleGetChatMessage,
  handleDeleteChatMessage,
} from './chatsData';

function getUserId(req: Request): string {
  const user = (req as any).user;
  if (!user?.id) throw new Error('Unauthorized');
  return user.id;
}

// ---------- Route handlers ----------

/** POST /chats – create a new chat. Body: { chat_name? } */
export const createChat = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_name } = req.body as { chat_name?: string };
  const result = await handleCreateChat(userId, chat_name);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data ?? []);
};

/** GET /chats – list chats for the user. */
export const listChats = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const result = await handleListChats(userId);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.data ?? []);
};

/** GET /chats/:chat_id – get one chat */
export const getChat = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_id } = req.params;
  if (!chat_id) {
    res.status(400).json({ error: 'chat_id is required' });
    return;
  }
  const result = await handleGetChat(userId, chat_id);
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(result.data);
};

/** PATCH /chats/:chat_id – update chat_name */
export const updateChat = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_id } = req.params;
  const { chat_name } = req.body as { chat_name?: string };
  if (!chat_id) {
    res.status(400).json({ error: 'chat_id is required' });
    return;
  }
  const result = await handleUpdateChat(userId, chat_id, chat_name ?? '');
  if (result.error) {
    const status = result.error === 'Chat not found' ? 404 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json(result.data);
};

/** DELETE /chats/:chat_id – delete a chat (messages cascade) */
export const deleteChat = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_id } = req.params;
  if (!chat_id) {
    res.status(400).json({ error: 'chat_id is required' });
    return;
  }
  const result = await handleDeleteChat(userId, chat_id);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(204).send();
};

/** GET /chats/:chat_id/messages – list messages. Query: limit?, order? */
export const listChatMessages = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_id } = req.params;
  const { limit, order } = req.query;
  if (!chat_id) {
    res.status(400).json({ error: 'chat_id is required' });
    return;
  }
  const limitNum = limit != null ? Number(limit) : undefined;
  const orderOpt = order === 'desc' ? 'desc' : 'asc';
  const result = await handleListChatMessages(userId, chat_id, {
    limit: limitNum,
    order: orderOpt,
  });
  if ('error' in result) {
    const status = result.error === 'Chat not found' ? 404 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json({ data: result.data ?? [] });
};

/** POST /chats/:chat_id/messages – add a message. Body: { message, usage? } */
export const createChatMessage = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_id } = req.params;
  const { message, usage } = req.body as { message: unknown; usage?: unknown };
  if (!chat_id) {
    res.status(400).json({ error: 'chat_id is required' });
    return;
  }
  if (message === undefined) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  const result = await handleCreateChatMessage(userId, chat_id, message, usage);
  if ('error' in result) {
    const status = result.error === 'Chat not found' ? 404 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.status(201).json(result.data);
};

/** GET /chats/:chat_id/messages/:message_id – get one message */
export const getChatMessage = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_id, message_id } = req.params;
  if (!chat_id || !message_id) {
    res.status(400).json({ error: 'chat_id and message_id are required' });
    return;
  }
  const result = await handleGetChatMessage(userId, chat_id, message_id);
  if ('error' in result) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(result.data);
};

/** DELETE /chats/:chat_id/messages/:message_id – delete a message */
export const deleteChatMessage = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { chat_id, message_id } = req.params;
  if (!chat_id || !message_id) {
    res.status(400).json({ error: 'chat_id and message_id are required' });
    return;
  }
  const result = await handleDeleteChatMessage(userId, chat_id, message_id);
  if ('error' in result) {
    const status = result.error === 'Chat not found' ? 404 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.status(204).send();
};

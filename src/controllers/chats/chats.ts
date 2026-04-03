import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendNoContent, sendOk } from '../../app/response';
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
import { getAuthUserId } from '../../shared/getAuthUserId';
import { CreateChatBody, CreateChatMessageBody, UpdateChatBody } from './chatsTypes';

// ---------- Route handlers ----------

/** POST /chats – create a new chat. Body: { chat_name? } */
export const createChat = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_name } = req.body as CreateChatBody;
    const result = await handleCreateChat(userId, chat_name);
    if (result.error) {
      throw badRequest(result.error);
    }
    sendOk(res, result.data ?? []);
  } catch (error) {
    sendError(res, error);
  }
};

/** GET /chats – list chats for the user. */
export const listChats = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const result = await handleListChats(userId);
    if (result.error) {
      throw badRequest(result.error);
    }
    sendOk(res, result.data ?? []);
  } catch (error) {
    sendError(res, error);
  }
};

/** GET /chats/:chat_id – get one chat */
export const getChat = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_id } = req.params;
    if (!chat_id) {
      throw badRequest('chat_id is required');
    }
    const result = await handleGetChat(userId, chat_id);
    if (result.error) {
      throw notFound(result.error);
    }
    sendOk(res, result.data);
  } catch (error) {
    sendError(res, error);
  }
};

/** PATCH /chats/:chat_id – update chat_name */
export const updateChat = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_id } = req.params;
    const { chat_name } = req.body as UpdateChatBody;
    if (!chat_id) {
      throw badRequest('chat_id is required');
    }
    const result = await handleUpdateChat(userId, chat_id, chat_name ?? '');
    if (result.error) {
      if (result.error === 'Chat not found') {
        throw notFound(result.error);
      }
      throw badRequest(result.error);
    }
    sendOk(res, result.data);
  } catch (error) {
    sendError(res, error);
  }
};

/** DELETE /chats/:chat_id – delete a chat (messages cascade) */
export const deleteChat = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_id } = req.params;
    if (!chat_id) {
      throw badRequest('chat_id is required');
    }
    const result = await handleDeleteChat(userId, chat_id);
    if (result.error) {
      throw badRequest(result.error);
    }
    sendNoContent(res);
  } catch (error) {
    sendError(res, error);
  }
};

/** GET /chats/:chat_id/messages – list messages. Query: limit?, order? */
export const listChatMessages = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_id } = req.params;
    const { limit, order } = req.query;
    if (!chat_id) {
      throw badRequest('chat_id is required');
    }
    const limitNum = limit != null ? Number(limit) : undefined;
    const orderOpt = order === 'desc' ? 'desc' : 'asc';
    const result = await handleListChatMessages(userId, chat_id, {
      limit: limitNum,
      order: orderOpt,
    });
    if ('error' in result) {
      const errorMessage = typeof result.error === 'string' ? result.error : 'Failed to list chat messages';
      if (errorMessage === 'Chat not found') {
        throw notFound(errorMessage);
      }
      throw badRequest(errorMessage);
    }
    sendOk(res, result.data ?? []);
  } catch (error) {
    sendError(res, error);
  }
};

/** POST /chats/:chat_id/messages – add a message. Body: { message, usage? } */
export const createChatMessage = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_id } = req.params;
    const { message, usage } = req.body as CreateChatMessageBody;
    if (!chat_id) {
      throw badRequest('chat_id is required');
    }
    if (message === undefined) {
      throw badRequest('message is required');
    }
    const result = await handleCreateChatMessage(userId, chat_id, message, usage);
    if ('error' in result) {
      const errorMessage = typeof result.error === 'string' ? result.error : 'Failed to create chat message';
      if (errorMessage === 'Chat not found') {
        throw notFound(errorMessage);
      }
      throw badRequest(errorMessage);
    }
    sendOk(res, result.data, 201);
  } catch (error) {
    sendError(res, error);
  }
};

/** GET /chats/:chat_id/messages/:message_id – get one message */
export const getChatMessage = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_id, message_id } = req.params;
    if (!chat_id || !message_id) {
      throw badRequest('chat_id and message_id are required');
    }
    const result = await handleGetChatMessage(userId, chat_id, message_id);
    if ('error' in result) {
      const errorMessage = typeof result.error === 'string' ? result.error : 'Message not found';
      throw notFound(errorMessage);
    }
    sendOk(res, result.data);
  } catch (error) {
    sendError(res, error);
  }
};

/** DELETE /chats/:chat_id/messages/:message_id – delete a message */
export const deleteChatMessage = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const { chat_id, message_id } = req.params;
    if (!chat_id || !message_id) {
      throw badRequest('chat_id and message_id are required');
    }
    const result = await handleDeleteChatMessage(userId, chat_id, message_id);
    if ('error' in result) {
      const errorMessage = typeof result.error === 'string' ? result.error : 'Failed to delete chat message';
      if (errorMessage === 'Chat not found') {
        throw notFound(errorMessage);
      }
      throw badRequest(errorMessage);
    }
    sendNoContent(res);
  } catch (error) {
    sendError(res, error);
  }
};

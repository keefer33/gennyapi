import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import {
  createChat,
  listChats,
  getChat,
  updateChat,
  deleteChat,
  listChatMessages,
  createChatMessage,
  getChatMessage,
  deleteChatMessage,
} from './chats';
import { runChat } from './runChat';

const router = express.Router();

// Stream chat completion (SSE, runAgent-style); must be before /chats/:chat_id
router.post('/run', authenticateUser, runChat);

// Supabase-backed chats (user_models_chats, user_models_chats_messages)
router.get('/chats', authenticateUser, listChats);
router.post('/chats', authenticateUser, createChat);
router.get('/chats/:chat_id', authenticateUser, getChat);
router.patch('/chats/:chat_id', authenticateUser, updateChat);
router.delete('/chats/:chat_id', authenticateUser, deleteChat);
router.get('/chats/:chat_id/messages', authenticateUser, listChatMessages);
router.post('/chats/:chat_id/messages', authenticateUser, createChatMessage);
router.get('/chats/:chat_id/messages/:message_id', authenticateUser, getChatMessage);
router.delete('/chats/:chat_id/messages/:message_id', authenticateUser, deleteChatMessage);

export default router;

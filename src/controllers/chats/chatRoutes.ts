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

const router = express.Router();

// Supabase-backed chats (user_models_chats, user_models_chats_messages)
router.get('/', authenticateUser, listChats);
router.post('/', authenticateUser, createChat);
router.get('/chat/:chat_id', authenticateUser, getChat);
router.patch('/chat/:chat_id', authenticateUser, updateChat);
router.delete('/chat/:chat_id', authenticateUser, deleteChat);
router.get('/chat/:chat_id/messages', authenticateUser, listChatMessages);
router.post('/chat/:chat_id/messages', authenticateUser, createChatMessage);
router.get('/chat/:chat_id/messages/:message_id', authenticateUser, getChatMessage);
router.delete('/chat/:chat_id/messages/:message_id', authenticateUser, deleteChatMessage);

export default router;

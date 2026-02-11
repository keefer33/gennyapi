import { Request, Response } from 'express';
import { getServerClient } from '../../utils/supabaseClient';
import axios from 'axios';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

// Get the user's OpenAI API key from user_api_keys (each user's own conversation history)
async function getUserOpenAIKey(userId: string): Promise<string | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data: rows, error } = await supabaseServerClient
    .from('user_api_keys')
    .select('api_key, name, config')
    .eq('user_id', userId);

  if (error || !rows?.length) return null;
  const openai = rows.find((r: any) => r.name === 'OpenAI' || (r.config?.provider === 'openai' && r.config?.type === 'openai'));
  return openai?.api_key ?? null;
}

// Create a conversation
export const createConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { agent_id, metadata } = req.body;

    if (!agent_id) {
      res.status(400).json({ error: 'agent_id is required' });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    // OpenAI Conversations API might not accept metadata in the request body
    // Try with empty body first, then with metadata if needed
    let response;
    try {
      response = await axios.post(
        `${OPENAI_API_BASE}/conversations`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error: any) {
      console.error('[createConversation] Error creating conversation:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: error.response?.data,
        message: error.message
      });
      throw error;
    }
    const conversation = response.data;

    console.log('[createConversation] Created conversation:', {
      conversationId: conversation.id,
      conversationIdFormat: typeof conversation.id,
      conversationIdLength: conversation.id?.length,
      fullResponse: conversation
    });

    // Store conversation_id in our database (link to thread if exists)
    const { supabaseServerClient } = await getServerClient();
    const { data: thread } = await supabaseServerClient
      .from('user_agents_threads')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_id', agent_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (thread) {
      await supabaseServerClient
        .from('user_agents_threads')
        .update({ conversation_id: conversation.id })
        .eq('id', thread.id)
        .eq('user_id', userId);
      console.log('[createConversation] Updated thread with conversation_id:', thread.id);
    }

    res.json(conversation);
  } catch (error: any) {
    console.error('[createConversation] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to create conversation' });
  }
};

// Retrieve a conversation
export const getConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { conversation_id } = req.params;
    const { agent_id } = req.query;

    if (!conversation_id) {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    if (!agent_id || typeof agent_id !== 'string') {
      res.status(400).json({ error: 'agent_id query parameter is required' });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    const response = await axios.get(
      `${OPENAI_API_BASE}/conversations/${conversation_id}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('[getConversation] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to retrieve conversation' });
  }
};

// Update a conversation
export const updateConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { conversation_id } = req.params;
    const { agent_id, metadata } = req.body;

    if (!conversation_id) {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    if (!agent_id) {
      res.status(400).json({ error: 'agent_id is required' });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    const response = await axios.post(
      `${OPENAI_API_BASE}/conversations/${conversation_id}`,
      { metadata: metadata || {} },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('[updateConversation] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to update conversation' });
  }
};

// Delete a conversation
export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { conversation_id } = req.params;
    const { agent_id } = req.query;

    if (!conversation_id) {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    if (!agent_id || typeof agent_id !== 'string') {
      res.status(400).json({ error: 'agent_id query parameter is required' });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    const response = await axios.delete(
      `${OPENAI_API_BASE}/conversations/${conversation_id}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('[deleteConversation] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete conversation' });
  }
};

// Create items (messages) in a conversation
export const createConversationItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { conversation_id } = req.params;
    const { agent_id, items } = req.body;

    if (!conversation_id) {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    if (!agent_id) {
      res.status(400).json({ error: 'agent_id is required' });
      return;
    }

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    const response = await axios.post(
      `${OPENAI_API_BASE}/conversations/${conversation_id}/items`,
      { items: items },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('[createConversationItems] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to create conversation items' });
  }
};

// List items in a conversation
export const listConversationItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { conversation_id } = req.params;
    const { agent_id, limit, after, before } = req.query;

    console.log('[listConversationItems] Request:', { conversation_id, agent_id, userId });

    if (!conversation_id) {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }

    if (!agent_id || typeof agent_id !== 'string') {
      res.status(400).json({ error: 'agent_id query parameter is required' });
      return;
    }

    // Local IDs format: "conv-1234567890-abc123" (no OpenAI persistence)
    const isLocalConversationId = /^conv-\d{13,}-[a-z0-9]+$/.test(conversation_id);
    if (isLocalConversationId) {
      res.json({ 
        object: 'list',
        data: [],
        first_id: null,
        last_id: null,
        has_more: false 
      });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    const params = new URLSearchParams();
    if (limit) params.append('limit', limit as string);
    if (after) params.append('after', after as string);
    if (before) params.append('before', before as string);

    console.log('[listConversationItems] Fetching from OpenAI API:', { conversation_id, hasParams: params.toString().length > 0 });
    
    const response = await axios.get(
      `${OPENAI_API_BASE}/conversations/${conversation_id}/items?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );
    
    console.log('[listConversationItems] OpenAI API response:', { 
      itemCount: response.data.data?.length || 0,
      hasMore: response.data.has_more 
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error('[listConversationItems] Error:', error);
    if (error.response) {
      console.error('[listConversationItems] Error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    res.status(500).json({ error: error?.message || 'Failed to list conversation items' });
  }
};

// Retrieve a specific item
export const getConversationItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { conversation_id, item_id } = req.params;
    const { agent_id } = req.query;

    if (!conversation_id || !item_id) {
      res.status(400).json({ error: 'conversation_id and item_id are required' });
      return;
    }

    if (!agent_id || typeof agent_id !== 'string') {
      res.status(400).json({ error: 'agent_id query parameter is required' });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    const response = await axios.get(
      `${OPENAI_API_BASE}/conversations/${conversation_id}/items/${item_id}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('[getConversationItem] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to retrieve conversation item' });
  }
};

// Delete a conversation item
export const deleteConversationItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { conversation_id, item_id } = req.params;
    const { agent_id } = req.query;

    if (!conversation_id || !item_id) {
      res.status(400).json({ error: 'conversation_id and item_id are required' });
      return;
    }

    if (!agent_id || typeof agent_id !== 'string') {
      res.status(400).json({ error: 'agent_id query parameter is required' });
      return;
    }

    const apiKey = await getUserOpenAIKey(userId);
    if (!apiKey) {
      res.status(400).json({ 
        error: 'OpenAI key required for conversations. Add your OpenAI key in API Keys.'
      });
      return;
    }

    const response = await axios.delete(
      `${OPENAI_API_BASE}/conversations/${conversation_id}/items/${item_id}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('[deleteConversationItem] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete conversation item' });
  }
};

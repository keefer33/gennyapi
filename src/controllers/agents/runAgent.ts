import { Request, Response } from 'express';
import { getServerClient } from '../../utils/supabaseClient';
import { Agent, run, MemorySession } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
import { createGatewayProvider } from '@ai-sdk/gateway';
import { OpenAI } from 'openai';
import axios from 'axios';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

export const runAgent = async (req: Request, res: Response): Promise<void> => {
  console.log('[runAgent] Request received:', {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });

  // Helper function to write SSE events (defined at function scope for error handling)
  let writeSSE: ((data: any) => void) | null = null;

  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;
    const { id: agentId, prompt, conversation_id } = req.body;

    if (!agentId || !prompt) {
      res.status(400).json({ error: 'Missing required fields: id and prompt are required' });
      return;
    }

    // Get agent from database
    const { supabaseServerClient } = await getServerClient();
    const { data: agent, error: agentError } = await supabaseServerClient
      .from('user_agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', userId)
      .single();

    if (agentError || !agent) {
      console.error('[runAgent] Error loading agent:', agentError);
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Load user's API keys from user_api_keys (predetermined: AI Gateway + OpenAI)
    const { data: userKeys, error: keysError } = await supabaseServerClient
      .from('user_api_keys')
      .select('name, api_key, config')
      .eq('user_id', userId);

    if (keysError) {
      console.error('[runAgent] Error loading user API keys:', keysError);
      res.status(500).json({ error: 'Failed to load API keys' });
      return;
    }

    const aiGatewayEntry = userKeys?.find((k: any) => k.name === 'AI Gateway' || (k.config?.provider === 'vercel' && k.config?.type === 'aigateway'));
    const openaiEntry = userKeys?.find((k: any) => k.name === 'OpenAI' || (k.config?.provider === 'openai' && k.config?.type === 'openai'));

    const aiGatewayKey = aiGatewayEntry?.api_key ?? null;
    const userOpenAIKey = openaiEntry?.api_key ?? null;

    if (!aiGatewayKey) {
      res.status(400).json({ error: 'AI Gateway key required. Add your Vercel AI Gateway key in API Keys.' });
      return;
    }

    // Get model from agent config or use default
    const agentConfig = agent.config as any;
    const modelId = agent.model_id || 'gpt-5.2';

    // All agents use the user's AI Gateway key (no server env var)
    const userGateway = createGatewayProvider({ apiKey: aiGatewayKey });
    const gatewayModel = userGateway(modelId);
    const agentModel = aisdk(gatewayModel);
    console.log('[runAgent] Using AI SDK gateway model:', modelId);

    // Conversations API uses the user's OpenAI key (each user's own conversation history)
    let conversationId = conversation_id;
    let session: MemorySession | undefined;
    let sessionMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const openaiApiKeyForConversation = userOpenAIKey;
    
    // Sync with OpenAI Conversations API using the user's OpenAI key (their own conversation history)
    if (openaiApiKeyForConversation) {
      try {
        // Check if conversation_id looks like a local ID (Vercel Gateway format)
        // Local IDs format: "conv-1234567890-abc123" (timestamp-random)
        const isLocalConversationId = conversationId && /^conv-\d{13,}-[a-z0-9]+$/.test(conversationId);
        
        if (conversationId && !isLocalConversationId) {
          // Try to retrieve existing conversation from OpenAI API
          try {
            const response = await axios.get(
              `${OPENAI_API_BASE}/conversations/${conversationId}`,
              {
                headers: {
                  'Authorization': `Bearer ${openaiApiKeyForConversation}`,
                },
              }
            );
            console.log('[runAgent] Retrieved existing conversation:', response.data.id);
            
            // Load conversation items to populate session context
            const itemsResponse = await axios.get(
              `${OPENAI_API_BASE}/conversations/${conversationId}/items`,
              {
                headers: {
                  'Authorization': `Bearer ${openaiApiKeyForConversation}`,
                },
                params: { limit: 100 },
              }
            );
            const items = itemsResponse.data.data || [];
            console.log('[runAgent] Loaded', items.length, 'items from conversation');
            
            // Convert conversation items to messages for MemorySession
            sessionMessages = [];
            for (const item of items) {
              if (item.type === 'message' && item.role && item.content) {
                let textContent = '';
                // Extract text from content array
                if (Array.isArray(item.content)) {
                  for (const contentBlock of item.content) {
                    if (contentBlock.type === 'input_text' || contentBlock.type === 'output_text' || contentBlock.type === 'text') {
                      textContent += (contentBlock.text || '') + ' ';
                    }
                  }
                } else if (typeof item.content === 'string') {
                  textContent = item.content;
                }
                
                if (textContent.trim()) {
                  sessionMessages.push({
                    role: item.role === 'user' ? 'user' : 'assistant',
                    content: textContent.trim(),
                  });
                }
              }
            }
            
            // Initialize session with conversation history
            session = new MemorySession();
            // Store session messages to prepend to prompt for context
            // This ensures the agent has access to conversation history
            console.log('[runAgent] Prepared', sessionMessages.length, 'messages for session context');
            
            // Store session messages for later use in prompt preparation
            // We'll prepend history when calling run()
          } catch (retrieveError: any) {
            // Conversation doesn't exist, create a new one
            if (retrieveError.response?.status === 404 || retrieveError.response?.status === 400) {
              console.log('[runAgent] Conversation not found, creating new one');
              try {
                const createResponse = await axios.post(
                  `${OPENAI_API_BASE}/conversations`,
                  {},
                  {
                    headers: {
                      'Authorization': `Bearer ${openaiApiKeyForConversation}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                conversationId = createResponse.data.id;
                console.log('[runAgent] Created new conversation:', conversationId);
                session = new MemorySession();
              } catch (createError: any) {
                console.error('[runAgent] Error creating conversation:', {
                  status: createError.response?.status,
                  statusText: createError.response?.statusText,
                  error: createError.response?.data,
                  message: createError.message
                });
                // Fallback to local conversation ID
                conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                session = new MemorySession();
              }
            } else {
              console.error('[runAgent] Error retrieving conversation:', retrieveError);
              throw retrieveError;
            }
          }
        } else if (!conversationId) {
          // No conversation ID provided, create a new one
          try {
            const createResponse = await axios.post(
              `${OPENAI_API_BASE}/conversations`,
              {},
              {
                headers: {
                  'Authorization': `Bearer ${openaiApiKeyForConversation}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            conversationId = createResponse.data.id;
            console.log('[runAgent] Created new conversation:', conversationId);
            session = new MemorySession();
          } catch (createError: any) {
            console.error('[runAgent] Error creating conversation:', {
              status: createError.response?.status,
              statusText: createError.response?.statusText,
              error: createError.response?.data,
              message: createError.message
            });
            // Fallback to local conversation ID
            conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            session = new MemorySession();
          }
        } else {
          // Local conversation ID (Vercel Gateway), use local session
          conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          session = new MemorySession();
        }
      } catch (conversationError) {
        console.error('[runAgent] Error managing conversation:', conversationError);
        // Fallback to local conversation ID only if OpenAI API is unavailable
        if (!conversationId) {
          conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        session = new MemorySession();
      }
    } else {
      // User has no OpenAI key in API Keys, use local conversation IDs (no history persistence)
      if (!conversationId) {
        conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      session = new MemorySession();
      console.warn('[runAgent] User has no OpenAI key set, using local conversation IDs');
    }

    // Create Agent instance
    const agentInstance = new Agent({
      name: agent.name,
      instructions: agentConfig?.description || 'You are a helpful assistant.',
      model: agentModel,
    });

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
    res.setHeader('X-Conversation-Id', conversationId);
    
    // Flush headers immediately
    res.flushHeaders();

    // Initialize writeSSE function
    writeSSE = (data: any) => {
      try {
        const sseLine = `data: ${JSON.stringify(data)}\n\n`;
        console.log(`[runAgent] Writing SSE event:`, data.type, data.content ? `content length: ${data.content.length}` : '');
        res.write(sseLine);
        // Flush if available (Node.js streams)
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (writeError) {
        console.error('[runAgent] Error writing SSE:', writeError);
      }
    };

    // Stream the results
    try {
      // Send conversation ID as initial event first
      console.log('[runAgent] Sending conversation_id:', conversationId);
      writeSSE({ type: 'conversation_id', conversation_id: conversationId });
      
      // Prepare prompt with conversation history if available
      let finalPrompt = prompt;
      if (sessionMessages && sessionMessages.length > 0) {
        const historyContext = sessionMessages
          .map((msg: { role: 'user' | 'assistant'; content: string }) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');
        finalPrompt = `Previous conversation:\n${historyContext}\n\nCurrent user message: ${prompt}`;
        console.log('[runAgent] Prepended conversation history to prompt');
      }
      
      // Run the agent with streaming (returns a Promise that resolves to a stream)
      console.log('[runAgent] Starting agent run with prompt:', finalPrompt.substring(0, 100));
      const resultPromise = run(agentInstance, finalPrompt, {
        stream: true,
        session: session,
      });
      console.log('[runAgent] Waiting for stream to be ready...');
      const result = await resultPromise;
      console.log('[runAgent] Agent run started, beginning to stream events...');

      // Track messages for saving to conversation
      let assistantText = '';
      const userMessage = prompt;
      let lastDeltaHash = ''; // Track hash of last sent delta to prevent duplicates

      // Stream events from the result
      try {
        let eventCount = 0;
        for await (const event of result) {
          eventCount++;
          console.log(`[runAgent] Received event #${eventCount}, type:`, event.type);
          
          // Log full event structure for first few events to debug
          if (eventCount <= 3) {
            console.log(`[runAgent] Full event structure:`, JSON.stringify(event, null, 2).substring(0, 1000));
          }
          
          if (event.type === 'run_item_stream_event') {
            // Skip run_item_stream_event during streaming - we'll get the final message after completion
            // Processing this during streaming causes duplication with raw_model_stream_event deltas
            continue;
          } else if (event.type === 'raw_model_stream_event') {
            // Stream raw model events for text deltas
            const data = (event as any).data;
            const eventAny = event as any;
            
            // Log the full event structure for debugging (first few events only)
            if (eventCount <= 5) {
              console.log(`[runAgent] raw_model_stream_event full event keys:`, Object.keys(eventAny));
              console.log(`[runAgent] raw_model_stream_event data structure:`, JSON.stringify(data, null, 2).substring(0, 500));
            }
            
            // Check if there's a delta directly on the event
            if (eventAny.delta && typeof eventAny.delta === 'string') {
              assistantText += eventAny.delta;
              console.log(`[runAgent] Extracted text from event.delta:`, eventAny.delta.substring(0, 50));
              writeSSE({ type: 'text', content: eventAny.delta });
            } else if (data) {
              // Check for different event structures from AI SDK Gateway
              // Structure 1: {"type":"model","event":{"type":"text-delta","delta":"text"}}
              if (data.type === 'model' && data.event) {
                const modelEvent = data.event;
                if (modelEvent.type === 'text-delta' && modelEvent.delta) {
                  const deltaText = modelEvent.delta;
                  const deltaHash = `${deltaText}-${eventCount}`;
                  
                  // Skip if this is a duplicate of the last delta we sent
                  if (deltaHash !== lastDeltaHash) {
                    assistantText += deltaText;
                    lastDeltaHash = deltaHash;
                    console.log(`[runAgent] Extracted text from model event delta:`, deltaText.substring(0, 50));
                    writeSSE({ type: 'text', content: deltaText });
                  } else {
                    console.log(`[runAgent] Skipped duplicate delta:`, deltaText.substring(0, 50));
                  }
                }
              }
              // Structure 2: {"type":"output_text_delta","delta":"text"} - SKIP these as they're duplicates
              else if (data.type === 'output_text_delta' && data.delta) {
                // Skip output_text_delta events - they're duplicates of model events
                console.log(`[runAgent] Skipped output_text_delta event (duplicate):`, data.delta.substring(0, 50));
                continue;
              }
              // Structure 3: Direct delta in data
              else if (data.delta && typeof data.delta === 'string') {
                const deltaText = data.delta;
                const deltaHash = `${deltaText}-${eventCount}`;
                
                // Skip if this is a duplicate of the last delta we sent
                if (deltaHash !== lastDeltaHash) {
                  assistantText += deltaText;
                  lastDeltaHash = deltaHash;
                  console.log(`[runAgent] Extracted text from data.delta:`, deltaText.substring(0, 50));
                  writeSSE({ type: 'text', content: deltaText });
                } else {
                  console.log(`[runAgent] Skipped duplicate delta:`, deltaText.substring(0, 50));
                }
              }
            }
          } else {
            // Check for message_output_item or other event types
            const eventAny = event as any;
            if (eventAny.type === 'message_output_item' && eventAny.item) {
              // Final message output - extract text content
              const item = eventAny.item;
              if (item && item.content) {
                let textContent = '';
                if (Array.isArray(item.content)) {
                  for (const contentBlock of item.content) {
                    if (contentBlock.type === 'text' && contentBlock.text) {
                      textContent += contentBlock.text;
                    } else if (contentBlock.text) {
                      textContent += contentBlock.text;
                    }
                  }
                } else if (typeof item.content === 'string') {
                  textContent = item.content;
                }
                
                if (textContent && !assistantText.includes(textContent)) {
                  assistantText = textContent; // Use final message as complete text
                  console.log('[runAgent] Final message output:', textContent.substring(0, 100));
                }
              }
            }
            // Other event types are ignored
          }
        }
      } catch (streamError: any) {
        console.error('[runAgent] Error during streaming:', streamError);
        if (writeSSE) {
          writeSSE({ type: 'error', error: streamError.message || 'Streaming error', errorType: streamError.constructor.name });
        }
      }

      // Save messages to conversation after streaming completes
      const isLocalConversationId = conversationId && /^conv-\d{13,}-[a-z0-9]+$/.test(conversationId);
      if (openaiApiKeyForConversation && conversationId && assistantText.trim() && !isLocalConversationId) {
        try {
          // Save both user and assistant messages in a single request
          // OpenAI Conversations API expects an 'items' array
          await axios.post(
            `${OPENAI_API_BASE}/conversations/${conversationId}/items`,
            {
              items: [
                {
                  type: 'message',
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: userMessage,
                    },
                  ],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: assistantText.trim(),
                    },
                  ],
                },
              ],
            },
            {
              headers: {
                'Authorization': `Bearer ${openaiApiKeyForConversation}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          console.log('[runAgent] Saved messages to conversation:', conversationId);
        } catch (saveError: any) {
          console.error('[runAgent] Error saving messages to conversation:', {
            status: saveError.response?.status,
            statusText: saveError.response?.statusText,
            error: saveError.response?.data,
            message: saveError.message
          });
          // Don't fail the request if saving fails
        }
      }

      // Send done event
      writeSSE({ type: 'done' });
      res.end();
    } catch (error: any) {
      console.error('[runAgent] Error:', error);
      writeSSE({ 
        type: 'error', 
        error: error.message || 'Unknown error', 
        errorType: error.constructor.name 
      });
      writeSSE({ type: 'done' });
      res.end();
    }
  } catch (error: any) {
    console.error('[runAgent] Outer error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    } else if (writeSSE) {
      writeSSE({ 
        type: 'error', 
        error: error.message || 'Unknown error', 
        errorType: error.constructor.name 
      });
      writeSSE({ type: 'done' });
      res.end();
    } else {
      try {
        res.status(500).json({ error: error.message || 'Internal server error' });
      } catch (e) {
        // Response already sent or closed
      }
    }
  }
};

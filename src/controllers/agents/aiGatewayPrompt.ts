import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { Request, Response } from 'express';
import { getServerClient } from '../../utils/supabaseClient';

export const aiGatewayPrompt = async (req: Request, res: Response): Promise<void> => {
  console.log('[aiGatewayPrompt] Request received:', {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });

  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = user.id;

    // Support both formats for backward compatibility:
    // 1. Standard format: { messages: UIMessage[], id?: string, thread_id?: string, agent_id?: string }
    // 2. Legacy format: { prompt: string, agent_id?: string, thread_id?: string }
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const { messages, id: chatId, prompt, thread_id, agent_id } = body;

    let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
    let originalMessages: UIMessage[] | undefined;
    let threadMessages: UIMessage[] | null = null;

    // Load thread messages if thread_id is provided
    if (thread_id && typeof thread_id === 'string') {
      try {
        const { supabaseServerClient } = await getServerClient();
        const { data: thread, error: threadError } = await supabaseServerClient
          .from('user_agents_threads')
          .select('messages, agent_id, user_id')
          .eq('id', thread_id)
          .eq('user_id', userId)
          .single();

        if (threadError) {
          console.error('[aiGatewayPrompt] Error loading thread:', threadError);
        } else if (thread && thread.messages && Array.isArray(thread.messages)) {
          threadMessages = thread.messages as UIMessage[];
          console.log('[aiGatewayPrompt] Loaded thread messages:', threadMessages.length, 'messages');
          
          // Verify agent_id matches if provided
          if (agent_id && thread.agent_id !== agent_id) {
            console.warn('[aiGatewayPrompt] Warning: thread agent_id mismatch');
          }
        }
      } catch (threadLoadError) {
        console.error('[aiGatewayPrompt] Error loading thread:', threadLoadError);
      }
    }

    if (Array.isArray(messages) && messages.length > 0) {
      // Standard format: messages array (for message persistence)
      // useChat already manages the full conversation state including thread messages,
      // so we use the incoming messages as-is
      console.log('[aiGatewayPrompt] Using messages array format, chatId:', chatId, 'thread_id:', thread_id, 'messages count:', messages.length);
      originalMessages = messages as UIMessage[];
      
      // Convert UIMessage[] to ModelMessage[] for the LLM
      modelMessages = await convertToModelMessages(originalMessages);
    } else if (typeof prompt === 'string' && prompt.trim()) {
      // Legacy format: single prompt string (backward compatibility)
      console.log('[aiGatewayPrompt] Using legacy prompt format:', prompt.substring(0, 50) + '...', 'thread_id:', thread_id);
      
      // If we have thread messages, convert them to model messages and append the new prompt
      if (threadMessages && threadMessages.length > 0) {
        const threadModelMessages = await convertToModelMessages(threadMessages);
        modelMessages = [...threadModelMessages, { role: 'user' as const, content: prompt }] as Awaited<ReturnType<typeof convertToModelMessages>>;
      } else {
        modelMessages = [{ role: 'user' as const, content: prompt }] as Awaited<ReturnType<typeof convertToModelMessages>>;
      }
    } else {
      console.log('[aiGatewayPrompt] Invalid request body:', body);
      res.status(400).json({ 
        error: 'Missing or invalid request body. Expected { messages: UIMessage[] } or { prompt: string }' 
      });
      return;
    }

    // Create the stream text result
    const result = streamText({
      model: 'openai/gpt-5.2',
      messages: modelMessages,
    });

    // Use pipeUIMessageStreamToResponse for Express compatibility
    // This handles the UI Message Stream format (SSE) that useChat expects
    if (originalMessages) {
      // Standard format with message persistence
      // Pipe the stream to response
      result.pipeUIMessageStreamToResponse(res);
      
      // Handle onFinish callback for message persistence (runs after stream completes)
      result.finishReason.then(async () => {
        try {
          // Get the final text from the stream
          const fullText = await result.text;
          console.log('[aiGatewayPrompt] Stream finished, final text length:', fullText.length);
          
          // Save messages to thread if thread_id is provided
          if (thread_id && originalMessages) {
            try {
              const { supabaseServerClient } = await getServerClient();
              
              // Construct the final messages array with the assistant response
              const assistantMessage: UIMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                parts: [{ type: 'text', text: fullText }],
              };
              
              const finalMessages: UIMessage[] = [...originalMessages, assistantMessage];
              
              // Update the thread with the new messages
              const { error: updateError } = await supabaseServerClient
                .from('user_agents_threads')
                .update({ 
                  messages: finalMessages,
                  updated_at: new Date().toISOString()
                })
                .eq('id', thread_id)
                .eq('user_id', userId);

              if (updateError) {
                console.error('[aiGatewayPrompt] Error saving messages to thread:', updateError);
              } else {
                console.log('[aiGatewayPrompt] Successfully saved', finalMessages.length, 'messages to thread:', thread_id);
              }
            } catch (saveError) {
              console.error('[aiGatewayPrompt] Error saving messages to thread:', saveError);
            }
          }
        } catch (finishError) {
          console.error('[aiGatewayPrompt] Error in finish callback:', finishError);
        }
      });
    } else {
      // Legacy format - use pipeUIMessageStreamToResponse
      result.pipeUIMessageStreamToResponse(res);
    }
  } catch (error) {
    console.error('[aiGatewayPrompt] Error streaming text:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream response' });
    } else {
      res.end();
    }
  }
};

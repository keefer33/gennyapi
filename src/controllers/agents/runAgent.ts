import { Request, Response } from 'express';
import { streamText, createGateway, stepCountIs, type ModelMessage } from 'ai';
import { saveAgentGeneratedFile } from '../../utils/generate';
import { handleListChatMessages, saveRunChatMessages } from '../chats/chatsData';
import { handleGetAgentModelByName, type AgentModelApiRow } from './agentsData';
import { messageRowsToModelMessages } from '../chats/chatsUtils';
import { getUserId, insertUserUsageLog, updateUserProfileUsageAmount } from '../../utils/utils';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import getAgentCustomTools from './agentCustomTools';

// ---------------------------------------------------------------------------
// Types (reused across runChat)
// ---------------------------------------------------------------------------

/** Request body for POST run-chat. */
interface RunChatBody {
  chat_id?: string | null;
  model_name?: string;
  settings?: {
    systemPrompt?: string;
  };
  prompt?: string;
  attachments?: Array<{
    url?: string;
    type?: string;
    name?: string;
    thumbnail_url?: string | null;
  }>;
}

type ChatAttachmentInput = {
  url: string;
  type?: string;
  name?: string;
  thumbnail_url?: string | null;
};

/** User message content part aligned with AI SDK user image parts: `{ type: 'image', image: url }`. */
export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content:
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: string }
        | { type: string; text?: string; image?: string }
      >
    | string;
};

/** Message row shape returned from handleListChatMessages. */
interface MessageRow {
  message: { role: string; content?: Array<{ type?: string; text?: string }> };
}

/** Stored assistant message part (matches AI SDK content part types + our image). */
type StoredPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; imageUrl: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; isError?: boolean };

/** API type from ai_models_apis (endpoint, ai-gateway, mcp). */
type ApiType = NonNullable<AgentModelApiRow['api_type']>;

export const runAgent = async (req: Request, res: Response): Promise<void> => {
  let writeSSE: ((data: Record<string, unknown>) => void) | null = null;
  try {
    const userId = getUserId(req);
    const body = (req.body || {}) as RunChatBody;
    const { chat_id, model_name, settings, prompt, attachments } = body;

    if (!model_name || typeof model_name !== 'string') {
      res.status(400).json({ error: 'model_name is required' });
      return;
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const modelResult = await handleGetAgentModelByName(model_name);
    if ('error' in modelResult) {
      res.status(404).json({ error: modelResult.error });
      return;
    }
    const modelRow = modelResult.data as {
      model_name: string;
      api_id?: { schema?: Record<string, unknown>; api_type?: string | null; pricing?: Record<string, unknown> } | null;
    };
    const modelId = modelRow.api_id?.schema?.model as string | undefined;
    if (!modelId) {
      res.status(400).json({ error: 'Selected model has no gateway model configured' });
      return;
    }
    const apiType: ApiType | null = (modelRow.api_id?.api_type as ApiType | null) ?? null;

    //TODO: Implement the apiType to allow for different apis to be used in the future
    switch (apiType) {
      case 'endpoint':
        break;
      case 'ai-gateway':
        break;
      case 'mcp':
        break;
      default:
        break;
    }

    //leave this here, it connects users to the composio tools
    const { gennyBotAigenTools, systemPrompt: gennyBotSystemPrompt } = await getAgentCustomTools(
      (req as any).user.authToken
    );
    let allTools: Record<string, unknown> = {};
    if (process.env.COMPOSIO_API_KEY) {
      try {
        const composio = new Composio({
          apiKey: process.env.COMPOSIO_API_KEY,
          provider: new VercelProvider(),
        });
        const session = await composio.create(userId, {
          experimental: {
            customToolkits: [gennyBotAigenTools],
          },
        });
        const composioTools = await session.tools();
        allTools = (composioTools ?? {}) as Record<string, unknown>;
      } catch (composioErr) {
        console.error('[runChat] Composio session/tools error:', composioErr);
      }
    }
    const hasTools = Object.keys(allTools).length > 0;

    let sessionMessages: ChatMessage[] = [];
    if (chat_id) {
      const msgResult = await handleListChatMessages(userId, chat_id, { order: 'asc' });
      if (!('error' in msgResult)) {
        sessionMessages = messageRowsToModelMessages(msgResult?.data as unknown as MessageRow[]);
      }
    }

    type NormalizedAttachment = ChatAttachmentInput;
    const normalizedAttachments = (attachments ?? []).filter(
      (a): a is NormalizedAttachment => typeof a?.url === 'string' && a.url.trim().length > 0
    );
    const attachmentLines = normalizedAttachments.map(a => `- ${String(a.type ?? 'file')} - ${a.url}`);
    const attachmentText = attachmentLines.length > 0 ? `\n\nAttached files:\n${attachmentLines.join('\n')}` : '';
    const messages: ChatMessage[] = [...sessionMessages];
    messages.push({ role: 'user', content: [{ type: 'text', text: `${prompt.trim()}${attachmentText}` }] });

    const baseSystemPrompt =
      typeof settings.systemPrompt === 'string' && settings.systemPrompt.trim()
        ? settings.systemPrompt.trim()
        : 'You are a helpful assistant.';
    const systemPrompt = `${baseSystemPrompt}\n\n${gennyBotSystemPrompt}`;

    const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
    const model = gateway(modelId as string);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    writeSSE = (data: Record<string, unknown>) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        const resWithFlush = res as Response & { flush?: () => void };
        if (typeof resWithFlush.flush === 'function') resWithFlush.flush();
      } catch (e) {
        console.error('[runChat] writeSSE:', e);
      }
    };

    const result = streamText({
      model,
      system: systemPrompt,
      messages: messages as ModelMessage[],
      tools: hasTools ? (allTools as Parameters<typeof streamText>[0]['tools']) : {},
      stopWhen: stepCountIs(50),
      onError({ error }) {
        if (writeSSE) writeSSE({ type: 'error', error: (error as Error).message ?? 'Streaming error' });
      },
      providerOptions: {
        gateway: {
          caching: 'auto',
        },
      },
    });

    let currentText = '';
    let currentReasoning = '';
    const collectedParts: StoredPart[] = [];
    let generatedFileIndex = 0;

    function flushText() {
      if (currentText.length > 0) {
        collectedParts.push({ type: 'text', text: currentText });
        currentText = '';
      }
    }
    function flushReasoning() {
      if (currentReasoning.length > 0) {
        //turning off saving reasoning for now
        //collectedParts.push({ type: 'reasoning', text: currentReasoning });
        currentReasoning = '';
      }
    }

    try {
      for await (const part of result.fullStream) {
        console.log('[runChat] Part:', part.type);
        switch (part.type) {
          case 'start':
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'start' });
            break;
          case 'finish':
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'finish' });
            break;
          case 'reasoning-start':
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'reasoning-start' });
            break;
          case 'reasoning-end':
            flushReasoning();
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'reasoning-end' });
            break;
          case 'tool-input-start': {
            const toolName = (part as { toolName?: string }).toolName;
            if (writeSSE)
              writeSSE({ type: 'stream_status', status: 'tool-input-start', tool_name: toolName ?? '' });
            break;
          }
          case 'tool-input-end': {
            const toolName = (part as { toolName?: string }).toolName;
            if (writeSSE)
              writeSSE({ type: 'stream_status', status: 'tool-input-end', tool_name: toolName ?? '' });
            break;
          }
          case 'start-step':
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'start-step' });
            break;
          case 'finish-step':
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'finish-step' });
            break;
          case 'text-delta':
            if (part.text) {
              flushReasoning();
              currentText += part.text;
              if (writeSSE) writeSSE({ type: 'text', content: part.text });
            }
            break;
          case 'reasoning-delta': {
            const text = (part as { text?: string }).text;
            if (text) {
              flushText();
              currentReasoning += text;
              if (writeSSE) writeSSE({ type: 'reasoning', content: text });
            }
            break;
          }
          case 'file': {
            flushText();
            flushReasoning();
            const file = (part as { file?: { base64?: string; mediaType?: string } }).file as
              | { base64?: string; mediaType?: string }
              | undefined;
            if (file?.base64 != null && file?.mediaType != null) {
              const dataUrl = `data:${file.mediaType};base64,${file.base64}`;
              let urlToSend = dataUrl;
              try {
                const buffer = Buffer.from(file.base64, 'base64');
                const ext = file.mediaType.startsWith('image/')
                  ? file.mediaType === 'image/png'
                    ? '.png'
                    : file.mediaType === 'image/webp'
                      ? '.webp'
                      : '.jpg'
                  : file.mediaType.startsWith('video/')
                    ? '.mp4'
                    : '.bin';
                const filename = `chat-generated-${Date.now()}-${generatedFileIndex++}${ext}`;
                const saveResult = await saveAgentGeneratedFile(buffer, filename, userId, {
                  agent_id: model_name,
                });
                if (saveResult?.file_url) {
                  urlToSend = saveResult.file_url;
                }
              } catch (e) {
                console.warn('[runChat] Failed to save generated file, sending data URL:', e);
              }
              if (writeSSE) writeSSE({ type: 'file', url: urlToSend, mediaType: file.mediaType });
              collectedParts.push({ type: 'image', imageUrl: urlToSend });
            }
            break;
          }
          case 'tool-call': {
            flushText();
            flushReasoning();
            const tc = part as { toolCallId?: string; toolName?: string; input?: unknown };
            if (tc.toolName) {
              if (writeSSE) {
                writeSSE({
                  type: 'stream_status',
                  status: 'tool-call',
                  tool_name: tc.toolName,
                });
                writeSSE({
                  type: 'tool_call',
                  tool_name: tc.toolName,
                  tool_call_id: tc.toolCallId,
                });
              }
              collectedParts.push({
                type: 'tool-call',
                toolCallId: tc.toolCallId ?? '',
                toolName: tc.toolName,
                input: tc.input ?? {},
              });
            }
            break;
          }
          case 'tool-result': {
            const tr = part as {
              toolCallId?: string;
              toolName?: string;
              input?: unknown;
              output?: unknown;
              isError?: boolean;
            };
            if (writeSSE) {
              writeSSE({
                type: 'stream_status',
                status: 'tool-result',
                tool_name: tr.toolName ?? '',
              });
              writeSSE({
                type: 'tool_result',
                tool_name: tr.toolName,
                tool_call_id: tr.toolCallId,
                input: tr.input,
                output: tr.output,
              });
            }
            collectedParts.push({
              type: 'tool-result',
              toolCallId: tr.toolCallId ?? '',
              toolName: tr.toolName ?? '',
              result: tr.output,
              isError: tr.isError,
            });
            break;
          }
          default:
            break;
        }
      }
      flushText();
      flushReasoning();
    } catch (streamErr: unknown) {
      console.error('[runChat] Error during streaming:', streamErr);
      if (writeSSE) {
        const err = streamErr instanceof Error ? streamErr : new Error(String(streamErr));
        writeSSE({
          type: 'error',
          error: err.message || 'Streaming error',
          errorType: err.constructor?.name ?? 'Error',
        });
      }
    }

    const usage = await result.usage;
    const gatewayData = await result.providerMetadata;
    const rawCost = gatewayData?.gateway?.cost ?? 0;
    // Profit margin is stored on the selected model's API pricing config as a percent (e.g. 20 => +20%).
    const modelCostPmRaw = modelRow.api_id?.pricing?.pm ?? 20;
    const modelCostPm = Number(modelCostPmRaw);
    const profitMultiplier = Number.isFinite(modelCostPm) ? 1 + modelCostPm / 100 : 1.2;
    const totalCost = Math.ceil(Number(rawCost) * profitMultiplier * 10000) / 10000;
    if (usage && writeSSE) {
      writeSSE({
        type: 'usage',
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
        total_tokens: usage.totalTokens ?? 0,
        total_cost: totalCost,
        requests: 1,
      });
    }

    if (chat_id) {
      const userMsg = {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: prompt.trim() }, ...normalizedAttachments],
      };
      const assistantMsg = {
        role: 'assistant' as const,
        content: collectedParts.length > 0 ? collectedParts : [{ type: 'text' as const, text: '' }],
      };
      const usagePayload = usage ? usage : null;
      if (usagePayload) {
        (usagePayload as unknown as { total_cost?: number }).total_cost = totalCost;
      }
      try {
        await saveRunChatMessages(userId, chat_id, userMsg, assistantMsg, {
          usage: usagePayload,
          gateway: gatewayData,
        });
        await insertUserUsageLog({
          user_id: userId,
          usage_amount: totalCost,
          type_id: 3,
          generation_id: null,
          transaction_id: null,
          meta: {
            model_name: modelRow.model_name ?? '',
            type: 'agent',
            usage: usagePayload,
          },
        });
        await updateUserProfileUsageAmount({ user_id: userId, amount: totalCost, type: 'debit' });
      } catch (e) {
        console.error('[runChat] Error inserting user usage log:', e);
      }
    }

    res.end();
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err?.message === 'Unauthorized') {
      if (!res.headersSent) res.status(401).json({ error: 'Unauthorized' });
      else if (writeSSE) writeSSE({ type: 'error', error: 'Unauthorized' });
      res.end();
      return;
    }
    if (err?.message === 'Chat not found') {
      if (!res.headersSent) res.status(404).json({ error: 'Chat not found' });
      else if (writeSSE) writeSSE({ type: 'error', error: 'Chat not found' });
      res.end();
      return;
    }
    console.error('[runChat]', e);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? 'Failed to run chat' });
    else if (writeSSE) writeSSE({ type: 'error', error: err?.message ?? 'Failed to run chat' });
    res.end();
  }
};

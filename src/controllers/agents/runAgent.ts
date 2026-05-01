import { Request, Response } from 'express';
import { streamText, createGateway, stepCountIs, type ModelMessage } from 'ai';
import { isAppError } from '../../app/error';
import { saveAgentGeneratedFile } from '../../shared/fileUtils';
import { handleListChatMessages, saveRunChatMessages } from "../../database/user_models_chats_messages";
import { messageRowsToModelMessages } from "../chats/chatsUtils";
import { MessageRow } from "../../database/types";
import getAgentCustomTools from './agentCustomTools';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { RunAgentHttpError, SSEWriter, ApiType, ChatMessage, StoredPart, RunAgentBody } from './types';
import { loadComposioTools, parseRunAgentInput, createSSEWriter, sendRunAgentError, getSelectedModelRow, normalizeAttachments } from './agentUtils';
import { updateUserUsageBalance } from '../../database/user_profiles';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { USAGE_LOG_TYPE_AI_MODEL_USAGE } from '../../database/const';

export const runAgent = async (req: Request, res: Response): Promise<void> => {
  let writeSSE: SSEWriter | null = null;
  try {
    const userId = getAuthUserId(req);
    const input = parseRunAgentInput((req.body || {}) as RunAgentBody);
    const { chat_id, model_name, settings, prompt, attachments } = input;
    const modelRow = await getSelectedModelRow(model_name);
    const modelId = modelRow.api_id?.schema?.model as string;
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
    const allTools = await loadComposioTools(userId, gennyBotAigenTools);
    const hasTools = Object.keys(allTools).length > 0;

    let sessionMessages: ChatMessage[] = [];
    if (chat_id) {
      const msgResult = await handleListChatMessages(userId, chat_id, { order: 'asc' });
      if (!('error' in msgResult)) {
        sessionMessages = messageRowsToModelMessages(msgResult?.data as unknown as MessageRow[]);
      }
    }

    const normalizedAttachments = normalizeAttachments(attachments);
    const attachmentLines = normalizedAttachments.map(a => `- ${String(a.type ?? 'file')} - ${a.url}`);
    const attachmentText = attachmentLines.length > 0 ? `\n\nAttached files:\n${attachmentLines.join('\n')}` : '';
    const messages: ChatMessage[] = [...sessionMessages];
    messages.push({ role: 'user', content: [{ type: 'text', text: `${prompt}${attachmentText}` }] });

    const baseSystemPrompt =
      typeof settings?.systemPrompt === 'string' && settings.systemPrompt.trim()
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

    writeSSE = createSSEWriter(res);
console.log('messages', messages);
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

    function objectRecord(value: unknown): Record<string, unknown> | null {
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    }

    function normalizeToolOutput(output: unknown): unknown {
      const wrapper = objectRecord(output);
      if (!wrapper) return output;

      const data = objectRecord(wrapper.data);
      const isComposioWrapper = 'successful' in wrapper || 'error' in wrapper || 'logId' in wrapper;
      if (!data || !isComposioWrapper) return output;

      return {
        ...data,
        ...(typeof wrapper.error === 'string' && wrapper.error.trim() ? { error: wrapper.error } : {}),
        ...(typeof wrapper.successful === 'boolean' ? { successful: wrapper.successful } : {}),
        ...(typeof wrapper.logId === 'string' && wrapper.logId.trim() ? { logId: wrapper.logId } : {}),
      };
    }

    try {
      for await (const part of result.fullStream) {
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
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'tool-input-start', tool_name: toolName ?? '' });
            break;
          }
          case 'tool-input-end': {
            const toolName = (part as { toolName?: string }).toolName;
            if (writeSSE) writeSSE({ type: 'stream_status', status: 'tool-input-end', tool_name: toolName ?? '' });
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
            const normalizedOutput = normalizeToolOutput(tr.output);
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
                output: normalizedOutput,
              });
            }
            collectedParts.push({
              type: 'tool-result',
              toolCallId: tr.toolCallId ?? '',
              toolName: tr.toolName ?? '',
              result: normalizedOutput,
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
          type_id: USAGE_LOG_TYPE_AI_MODEL_USAGE,
          gen_model_run_id: null,
          transaction_id: null,
          meta: {
            model_name: modelRow.model_name ?? '',
            type: 'agent',
            usage: usagePayload,
          },
        });
          await updateUserUsageBalance(userId, totalCost, 'debit');
      } catch (e) {
        console.error('[runChat] Error inserting user usage log:', e);
      }
    }

    res.end();
  } catch (e: unknown) {
    if (e instanceof RunAgentHttpError) {
      sendRunAgentError(res, writeSSE, e.statusCode, e.message);
      return;
    }
    if (isAppError(e)) {
      sendRunAgentError(res, writeSSE, e.statusCode, e.message);
      return;
    }
    const err = e as { message?: string };
    // Keep compatibility with existing thrown string messages from shared helpers.
    if (err?.message === 'Unauthorized') return sendRunAgentError(res, writeSSE, 401, 'Unauthorized');
    if (err?.message === 'Chat not found') return sendRunAgentError(res, writeSSE, 404, 'Chat not found');
    console.error('[runChat]', e);
    sendRunAgentError(res, writeSSE, 500, err?.message ?? 'Failed to run chat');
  }
};

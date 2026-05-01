
import { MessageRow } from "../../database/types";

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function unwrapToolResultPayload(result: Record<string, unknown>): Record<string, unknown> {
  const data = objectRecord(result.data);
  return data ?? result;
}

function compactToolCallContext(part: Record<string, unknown>): string | null {
  if (part.type !== 'tool-call') return null;

  const input = objectRecord(part.input);
  if (!input) return null;

  const directGenerationId = typeof input.generation_id === 'string' ? input.generation_id.trim() : '';
  const toolCalls = Array.isArray(input.tools) ? input.tools : [];
  const nestedGenerationIds = toolCalls
    .map(tool => {
      const toolRecord = objectRecord(tool);
      const args = objectRecord(toolRecord?.arguments);
      return typeof args?.generation_id === 'string' ? args.generation_id.trim() : '';
    })
    .filter(Boolean);
  const generationIds = [...new Set([directGenerationId, ...nestedGenerationIds].filter(Boolean))];

  if (generationIds.length === 0) return null;

  const toolName = typeof part.toolName === 'string' && part.toolName.trim() ? part.toolName.trim() : 'tool';
  return [`Tool call context from ${toolName}:`, `- generation_id: ${generationIds.join(', ')}`].join('\n');
}

function compactToolResultContext(part: Record<string, unknown>): string | null {
  if (part.type !== 'tool-result') return null;

  const wrappedResult = objectRecord(part.result);
  if (!wrappedResult) return null;

  const result = unwrapToolResultPayload(wrappedResult);

  const generationId = typeof result.generation_id === 'string' ? result.generation_id.trim() : '';
  const status = typeof result.status === 'string' ? result.status.trim() : '';
  const cost = typeof result.cost === 'number' ? result.cost : null;
  const message = typeof result.message === 'string' ? result.message.trim() : '';
  const files = Array.isArray(result.generation_files) ? result.generation_files : [];

  if (!generationId && !status && !cost && files.length === 0) return null;

  const toolName = typeof part.toolName === 'string' && part.toolName.trim() ? part.toolName.trim() : 'tool';
  const lines = [`Tool result context from ${toolName}:`];
  if (generationId) lines.push(`- generation_id: ${generationId}`);
  if (status) lines.push(`- status: ${status}`);
  if (cost != null) lines.push(`- cost: ${cost}`);
  if (files.length > 0) lines.push(`- generated_files_count: ${files.length}`);
  if (message && message.length < 300) lines.push(`- message: ${message}`);

  return lines.join('\n');
}

/** Build { role, content }[] from message rows for streamText. */
export function messageRowsToModelMessages(rows: MessageRow[]) {
    return rows
      .map(row => {
        const contentArray = (row.message?.content ?? []) as Array<Record<string, unknown>>;
        const textContent =
          contentArray
            .map(p => {
              const partType = typeof (p as any).type === 'string' ? (p as any).type : undefined;
              if (partType === 'text' || partType === 'reasoning') {
                return typeof (p as any).text === 'string' ? (p as any).text : '';
              }
              return '';
            })
            .join('')
            .trim() || '';

        // Build a stable text context for attachments (images/videos/files).
        // Chat history may contain either:
        // - AI SDK parts: { type: 'image'|'video'|'file', image|videoUrl|fileUrl, ... }
        // - persisted attachment inputs: { type: '<mime>', url, thumbnail_url, ... }
        const attachmentLines: string[] = [];
        const toolResultContextLines: string[] = [];

        for (const p of contentArray) {
          const partType = typeof (p as any).type === 'string' ? (p as any).type : undefined;
          const url = typeof (p as any).url === 'string' ? (p as any).url : undefined;
          const imageUrl = typeof (p as any).imageUrl === 'string' ? (p as any).imageUrl : undefined;
          const image = typeof (p as any).image === 'string' ? (p as any).image : undefined;
          const videoUrl = typeof (p as any).videoUrl === 'string' ? (p as any).videoUrl : undefined;
          const fileUrl = typeof (p as any).fileUrl === 'string' ? (p as any).fileUrl : undefined;
          const toolCallContext = compactToolCallContext(p);
          const toolResultContext = compactToolResultContext(p);

          if (toolCallContext) {
            toolResultContextLines.push(toolCallContext);
            continue;
          }

          if (toolResultContext) {
            toolResultContextLines.push(toolResultContext);
            continue;
          }

          if (partType === 'image' && (image || imageUrl)) {
            attachmentLines.push(`- ${(p as any).mediaType ?? 'image'} - ${image ?? imageUrl}`);
            continue;
          }
          if (partType === 'video' && videoUrl) {
            attachmentLines.push(`- ${(p as any).mediaType ?? 'video'} - ${videoUrl}`);
            continue;
          }
          if (partType === 'file' && fileUrl) {
            attachmentLines.push(`- ${(p as any).mediaType ?? 'file'} - ${fileUrl}`);
            continue;
          }

          // persisted raw attachment inputs
          if (partType && url) {
            attachmentLines.push(`- ${partType} - ${url}`);
          }
        }

        const attachmentsAsText =
          attachmentLines.length > 0 ? `\n\nAttached files:\n${attachmentLines.join('\n')}` : '';
        const toolResultsAsText =
          toolResultContextLines.length > 0
            ? `\n\nPrevious tool results:\n${toolResultContextLines.join('\n\n')}`
            : '';

        const mergedText = `${textContent}${attachmentsAsText}${toolResultsAsText}`;

        return {
          role: (row.message?.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: mergedText,
        };
      })
      .filter(m => {
        return typeof m.content === 'string' ? m.content.length > 0 : false;
      });
  }
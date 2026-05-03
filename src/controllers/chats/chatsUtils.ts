import { MessageRow } from '../../database/types';

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function truncate(value: string, max = 240): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function buildGenerationMemoryContext(chatMetadata: unknown): string {
  const metadata = objectRecord(chatMetadata);
  const generations = Array.isArray(metadata?.generations) ? metadata.generations : [];
  if (generations.length === 0) return '';

  const lines = ['Known generations for this chat:'];
  for (const generation of generations) {
    const generationRecord = objectRecord(generation);
    const generationId = stringValue(generationRecord?.generation_id);
    if (!generationRecord || !generationId) continue;

    const toolCall = objectRecord(generationRecord.tool_call);
    const toolResult = objectRecord(generationRecord.tool_result);
    const args = objectRecord(toolCall?.arguments);
    const files = Array.isArray(toolResult?.files) ? toolResult.files : [];
    const prompt = stringValue(args?.prompt);

    lines.push(`- generation_id: ${generationId}`);
    const status = stringValue(toolResult?.status);
    if (status) lines.push(`  status: ${status}`);
    const toolSlug = stringValue(toolCall?.tool_slug);
    if (toolSlug) lines.push(`  tool: ${toolSlug}`);
    if (prompt) lines.push(`  prompt: ${truncate(prompt)}`);
    const cost = typeof toolResult?.cost === 'number' ? toolResult.cost : null;
    if (cost != null) lines.push(`  cost: ${cost}`);
    if (files.length > 0) {
      lines.push(`  files: ${files.length}`);
      for (const file of files.slice(0, 4)) {
        const fileRecord = objectRecord(file);
        const url = stringValue(fileRecord?.url);
        const thumbnailUrl = stringValue(fileRecord?.thumbnail_url);
        if (url || thumbnailUrl) lines.push(`  - file_url: ${url || thumbnailUrl}`);
      }
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/** Build { role, content }[] from message rows for streamText. */
export function messageRowsToModelMessages(rows: MessageRow[], chatMetadata?: unknown) {
  const messages = rows
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

      for (const p of contentArray) {
        const partType = typeof (p as any).type === 'string' ? (p as any).type : undefined;
        const url = typeof (p as any).url === 'string' ? (p as any).url : undefined;
        const imageUrl = typeof (p as any).imageUrl === 'string' ? (p as any).imageUrl : undefined;
        const image = typeof (p as any).image === 'string' ? (p as any).image : undefined;
        const videoUrl = typeof (p as any).videoUrl === 'string' ? (p as any).videoUrl : undefined;
        const fileUrl = typeof (p as any).fileUrl === 'string' ? (p as any).fileUrl : undefined;

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

      const attachmentsAsText = attachmentLines.length > 0 ? `\n\nAttached files:\n${attachmentLines.join('\n')}` : '';

      const mergedText = `${textContent}${attachmentsAsText}`;

      return {
        role: (row.message?.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: mergedText,
      };
    })
    .filter(m => {
      return typeof m.content === 'string' ? m.content.length > 0 : false;
    });

  const generationMemoryContext = buildGenerationMemoryContext(chatMetadata);
  if (generationMemoryContext) {
    messages.push({
      role: 'assistant',
      content: generationMemoryContext,
    });
  }

  return messages;
}

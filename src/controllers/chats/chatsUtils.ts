
import { MessageRow } from "../../database/types";

/** Build { role, content }[] from message rows for streamText (text + reasoning only). */
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

        const attachmentsAsText =
          attachmentLines.length > 0 ? `\n\nAttached files:\n${attachmentLines.join('\n')}` : '';

        const mergedText = `${textContent}${attachmentsAsText}`;

        return {
          role: (row.message?.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: mergedText,
        };
      })
      .filter(m => {
        return typeof m.content === 'string' ? m.content.length > 0 : false;
      });
  }
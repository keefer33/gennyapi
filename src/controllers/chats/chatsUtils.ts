
/** Build { role, content }[] from message rows for streamText (text + reasoning only). */
export function messageRowsToModelMessages(
    rows: { message: { role: string; content?: Array<{ type?: string; text?: string }> } }[]
  ) {
    return rows
      .map(row => {
        const contentArray = row.message?.content ?? [];
        const content =
          contentArray
            .map(p => (p.type === 'text' || p.type === 'reasoning' ? (p.text ?? '') : ''))
            .join('')
            .trim() || '';
        return { role: (row.message?.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: content };
      })
      .filter(m => m.content.length > 0);
  }
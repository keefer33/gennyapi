import {
  getUserVoiceWithFilesForUser,
  listUserVoicesForUser,
  type UserVoiceWithFilesRow,
} from '../../database/user_voices';
import {
  cloneVoiceFromSharedLibrary,
  searchSharedVoiceLibrary,
  summarizeSharedVoiceItem,
} from '../../shared/sharedVoiceLibrary';
import { assistSpeechScript } from '../../shared/assistSpeechScript';
import { assistVoiceDesign } from '../../shared/assistVoiceDesign';
import { cloneUserVoice } from '../../shared/cloneUserVoice';
import { designAndCreateUserVoices } from '../../shared/designUserVoices';
import { deleteUserVoice } from '../../shared/deleteUserVoice';
import { synthesizeUserVoiceSpeech } from '../../shared/synthesizeUserVoiceSpeech';
import { updateUserVoice } from '../../shared/updateUserVoice';
import { inworldVoiceIdFromMetadata } from '../../shared/voiceMetadata';

function toolOk(data: Record<string, unknown>): Record<string, unknown> {
  return { success: true, ...data };
}

function toolError(message: string): Record<string, unknown> {
  return { success: false, message };
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

function summarizeVoiceFile(file: { id?: string | null; file_path?: string | null; file_type?: string | null }) {
  return {
    id: file.id ?? null,
    url: file.file_path?.trim() || null,
    type: file.file_type?.trim() || null,
  };
}

function summarizeVoiceRow(voice: UserVoiceWithFilesRow): Record<string, unknown> {
  const files = Array.isArray(voice.files) ? voice.files : [];
  return {
    id: voice.id,
    name: voice.name?.trim() || null,
    description: voice.description?.trim() || null,
    language: voice.language?.trim() || null,
    gender: voice.gender?.trim() || null,
    age: voice.age?.trim() || null,
    accent: voice.accent?.trim() || null,
    source: voice.source?.trim() || null,
    type: voice.type?.trim() || null,
    inworld_voice_id: inworldVoiceIdFromMetadata(voice.metadata),
    preview_files: files.map(summarizeVoiceFile),
    created_at: voice.created_at ?? null,
  };
}

export async function listUserVoicesToolResult(
  userId: string,
  input: { search?: string; limit?: number }
): Promise<Record<string, unknown>> {
  try {
    const limit = Math.min(50, Math.max(1, Math.round(input.limit ?? 20)));
    const { voices, total } = await listUserVoicesForUser(userId, {
      limit,
      search: trimOptional(input.search),
    });
    return toolOk({
      voices: voices.map(summarizeVoiceRow),
      total,
      limit,
      notes:
        'Include preview audio as markdown links: [Preview: voice name](preview_url). Use preview_url from preview_files or preview_url when listing voices.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to list voices');
  }
}

export async function searchVoiceLibraryToolResult(input: {
  search?: string;
  page?: number;
  page_size?: number;
  gender?: string;
  language?: string;
  accent?: string;
  category?: string;
  featured?: boolean;
}): Promise<Record<string, unknown>> {
  try {
    const result = await searchSharedVoiceLibrary(input);
    return toolOk({
      voices: result.voices.map(summarizeSharedVoiceItem),
      has_more: result.has_more,
      total_count: result.total_count,
      page: result.page,
      page_size: result.page_size,
      notes:
        'library_voice_id is the ElevenLabs community voice id. Use preview_url + library_voice_id with CLONE_VOICE_FROM_LIBRARY. Genny voice_id is only assigned after cloning to the user library.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to search voice library');
  }
}

export async function cloneVoiceFromLibraryToolResult(
  userId: string,
  input: {
    library_voice_id?: string;
    preview_url?: string;
    name?: string;
    description?: string;
    language?: string;
    gender?: string;
    age?: string;
    accent?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const libraryVoiceId = (input.library_voice_id ?? '').trim();
    const previewUrl = (input.preview_url ?? '').trim();
    if (!libraryVoiceId) return toolError('library_voice_id is required');
    if (!previewUrl) {
      return toolError(
        'preview_url is required. Run SEARCH_VOICE_LIBRARY and pass preview_url from the chosen voice.'
      );
    }

    const result = await cloneVoiceFromSharedLibrary(userId, {
      library_voice_id: libraryVoiceId,
      preview_url: previewUrl,
      name: trimOptional(input.name),
      description: trimOptional(input.description),
      language: trimOptional(input.language),
      gender: trimOptional(input.gender),
      age: trimOptional(input.age),
      accent: trimOptional(input.accent),
    });

    return toolOk({
      voice: summarizeVoiceRow({ ...result.voice, files: [result.file] }),
      inworld_voice_id: result.inworld.voiceId,
      library_voice_id: libraryVoiceId,
      message: `Voice "${result.voice.name?.trim() || libraryVoiceId}" was cloned from the community library into the user's library.`,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to clone voice from library');
  }
}

export async function getVoiceToolResult(
  userId: string,
  voiceId: string
): Promise<Record<string, unknown>> {
  try {
    const id = voiceId.trim();
    if (!id) return toolError('voice_id is required');

    const voice = await getUserVoiceWithFilesForUser(userId, id);
    if (!voice) return toolError('Voice not found in the user library');

    return toolOk({ voice: summarizeVoiceRow(voice) });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to get voice');
  }
}

export async function assistVoiceDesignToolResult(input: {
  designPrompt?: string;
  previewText?: string;
  gender?: string;
  age?: string;
  accent?: string;
  defaultName?: string;
}): Promise<Record<string, unknown>> {
  try {
    const result = await assistVoiceDesign({
      designPrompt: trimOptional(input.designPrompt),
      previewText: trimOptional(input.previewText),
      gender: trimOptional(input.gender),
      age: trimOptional(input.age),
      accent: trimOptional(input.accent),
      defaultName: trimOptional(input.defaultName),
    });
    return toolOk({
      designPrompt: result.designPrompt,
      previewText: result.previewText,
      gender: result.gender,
      age: result.age,
      accent: result.accent,
      defaultName: result.defaultName,
      notes:
        'designPrompt must be 30–250 characters; previewText 50–200 characters (~5–15 seconds spoken). Use DESIGN_VOICE next.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Voice design assist failed');
  }
}

function summarizeDesignedVoice(voice: UserVoiceWithFilesRow, index: number): Record<string, unknown> {
  const files = Array.isArray(voice.files) ? voice.files : [];
  const previewFile = files.find(f => f.file_path?.trim()) ?? files[0];
  const preview_url = previewFile?.file_path?.trim() || null;
  const preview_key = String.fromCharCode(65 + index);
  return {
    voice_id: voice.id,
    preview_key,
    name: voice.name?.trim() || null,
    preview_label: `Preview ${preview_key}`,
    preview_url,
    inworld_voice_id: inworldVoiceIdFromMetadata(voice.metadata),
    preview_files: files.map(summarizeVoiceFile),
  };
}

function buildDesignVoiceMarkdown(voices: Array<Record<string, unknown>>): string {
  const lines = [
    'Here are your designed voice previews — all saved in your library.',
    'Listen and tell me **which one to keep** (A, B, or C) and the **final name**.',
    '',
  ];

  for (const voice of voices) {
    const previewKey = typeof voice.preview_key === 'string' ? voice.preview_key : '?';
    const name = typeof voice.name === 'string' && voice.name.trim() ? voice.name.trim() : `Preview ${previewKey}`;
    const voiceId = typeof voice.voice_id === 'string' ? voice.voice_id.trim() : '';
    const previewUrl = typeof voice.preview_url === 'string' ? voice.preview_url.trim() : '';

    lines.push(`### Preview ${previewKey}: ${name}`);
    if (voiceId) lines.push(`voice_id: \`${voiceId}\``);
    if (previewUrl) lines.push(`[Preview ${previewKey}](${previewUrl})`);
    lines.push('');
  }

  lines.push(
    'Reply with your choice (A/B/C) and final name. I will UPDATE_VOICE for the keeper and DELETE_VOICE for the others.'
  );
  return lines.join('\n');
}

function voiceIdByPreview(voices: Array<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const voice of voices) {
    const key = typeof voice.preview_key === 'string' ? voice.preview_key : '';
    const id = typeof voice.voice_id === 'string' ? voice.voice_id.trim() : '';
    if (key && id) out[key] = id;
  }
  return out;
}

export async function designVoiceToolResult(
  userId: string,
  input: {
    designPrompt?: string;
    previewText?: string;
    language?: string;
    numberOfSamples?: number;
    baseName?: string;
    base_name?: string;
    gender?: string;
    age?: string;
    accent?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const designPrompt = (input.designPrompt ?? '').trim();
    const previewText = (input.previewText ?? '').trim();
    if (!designPrompt) return toolError('designPrompt is required');
    if (!previewText) return toolError('previewText is required');

    const numberOfSamples =
      input.numberOfSamples == null
        ? 3
        : Math.min(3, Math.max(1, Math.round(input.numberOfSamples)));

    const result = await designAndCreateUserVoices(userId, {
      designPrompt,
      previewText,
      langCode: trimOptional(input.language) ?? 'EN_US',
      numberOfSamples,
      baseName: trimOptional(input.baseName) ?? trimOptional(input.base_name),
      gender: trimOptional(input.gender) ?? null,
      age: trimOptional(input.age) ?? null,
      accent: trimOptional(input.accent) ?? null,
    });

    const voices = result.voices.map((voice, index) => summarizeDesignedVoice(voice, index));
    const withPreviewUrl = voices.filter(v => typeof v.preview_url === 'string' && v.preview_url);
    if (withPreviewUrl.length === 0) {
      return toolError('Voices were saved but no preview URLs were available for playback.');
    }

    return toolOk({
      langCode: result.langCode,
      designPrompt: result.designPrompt,
      previewText: result.previewText,
      voices,
      voice_id_by_preview: voiceIdByPreview(voices),
      markdown: buildDesignVoiceMarkdown(voices),
      display_instruction:
        'Your reply MUST include the markdown field exactly as provided so each preview keeps its voice_id in chat history for UPDATE_VOICE and DELETE_VOICE on the next turn. Do not omit voice_id lines or invent URLs.',
      notes:
        'Each preview has preview_key (A/B/C), voice_id, and preview_url. After the user picks, call UPDATE_VOICE with that voice_id and name, then DELETE_VOICE for the other voice_ids.',
      next_step:
        'Wait for the user to pick A/B/C and a final name, then UPDATE_VOICE for the keeper and DELETE_VOICE for the rest.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Voice design failed');
  }
}

export async function updateVoiceToolResult(
  userId: string,
  input: {
    voice_id?: string;
    name?: string;
    display_name?: string;
    description?: string;
    gender?: string;
    age?: string;
    accent?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const voiceId = (input.voice_id ?? '').trim();
    const displayName = (input.name ?? input.display_name ?? '').trim();
    if (!voiceId) return toolError('voice_id is required');
    if (!displayName) return toolError('name is required');

    await updateUserVoice(userId, voiceId, {
      name: displayName,
      ...(trimOptional(input.description) ? { description: trimOptional(input.description) } : {}),
      ...(trimOptional(input.gender) ? { gender: trimOptional(input.gender) } : {}),
      ...(trimOptional(input.age) ? { age: trimOptional(input.age) } : {}),
      ...(trimOptional(input.accent) ? { accent: trimOptional(input.accent) } : {}),
    });

    const voice = await getUserVoiceWithFilesForUser(userId, voiceId);
    if (!voice) return toolError('Voice not found after update');

    return toolOk({
      voice: summarizeVoiceRow(voice),
      voice_id: voiceId,
      message: `Voice updated to "${displayName}".`,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to update voice');
  }
}

/** @deprecated Use updateVoiceToolResult — kept for any stale tool registrations. */
export const publishVoiceToolResult = updateVoiceToolResult;

export async function deleteVoiceToolResult(
  userId: string,
  input: { voice_id?: string }
): Promise<Record<string, unknown>> {
  try {
    const voiceId = (input.voice_id ?? '').trim();
    if (!voiceId) return toolError('voice_id is required');

    await deleteUserVoice(userId, voiceId);

    return toolOk({
      voice_id: voiceId,
      message: 'Voice deleted from the user library.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to delete voice');
  }
}

export async function cloneVoiceToolResult(
  userId: string,
  input: {
    audio_url?: string;
    name?: string;
    description?: string;
    language?: string;
    gender?: string;
    age?: string;
    accent?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const audioUrl = (input.audio_url ?? '').trim();
    const name = (input.name ?? '').trim();
    if (!audioUrl) return toolError('audio_url is required');
    if (!name) return toolError('name is required');

    const result = await cloneUserVoice(userId, {
      audioUrl,
      name,
      description: trimOptional(input.description),
      language: trimOptional(input.language),
      gender: trimOptional(input.gender),
      age: trimOptional(input.age),
      accent: trimOptional(input.accent),
      type: 'clone',
    });

    return toolOk({
      voice: summarizeVoiceRow({ ...result.voice, files: [result.file] }),
      inworld_voice_id: result.inworld.voiceId,
      message: `Voice clone "${name}" was created.`,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Voice clone failed');
  }
}

export async function synthesizeVoiceSpeechToolResult(
  userId: string,
  input: { voice_id?: string; text?: string; title?: string }
): Promise<Record<string, unknown>> {
  try {
    const voiceId = (input.voice_id ?? '').trim();
    const text = (input.text ?? '').trim();
    if (!voiceId) return toolError('voice_id is required');
    if (!text) return toolError('text is required');
    if (text.length > 2000) return toolError('text must be at most 2000 characters');

    const voice = await getUserVoiceWithFilesForUser(userId, voiceId);
    if (!voice?.id) return toolError('Voice not found in the user library');

    const inworldVoiceId = inworldVoiceIdFromMetadata(voice.metadata);
    if (!inworldVoiceId) {
      return toolError('This voice is not linked to Inworld and cannot synthesize speech.');
    }

    const result = await synthesizeUserVoiceSpeech(userId, {
      voiceId: voice.id,
      inworldVoiceId,
      text,
      title: trimOptional(input.title),
    });

    return toolOk({
      speech_id: result.speech.id,
      voice_id: result.voice.id,
      title: result.speech.title?.trim() || null,
      transcript: result.speech.transcript?.trim() || text,
      audio_url: result.file.file_path?.trim() || null,
      file_id: result.file.id,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Speech synthesis failed');
  }
}

export async function assistSpeechScriptToolResultForUser(
  userId: string,
  input: {
    text?: string;
    title?: string;
    voice_id?: string;
    random?: boolean;
  }
): Promise<Record<string, unknown>> {
  try {
    let voiceName: string | undefined;
    let voiceDescription: string | undefined;
    let gender: string | undefined;
    let age: string | undefined;
    let accent: string | undefined;

    const voiceId = trimOptional(input.voice_id);
    if (voiceId) {
      const voice = await getUserVoiceWithFilesForUser(userId, voiceId);
      if (voice) {
        voiceName = voice.name?.trim() || undefined;
        voiceDescription = voice.description?.trim() || undefined;
        gender = voice.gender?.trim() || undefined;
        age = voice.age?.trim() || undefined;
        accent = voice.accent?.trim() || undefined;
      }
    }

    const result = await assistSpeechScript({
      text: input.random ? undefined : trimOptional(input.text),
      title: trimOptional(input.title),
      voiceName,
      voiceDescription,
      gender,
      age,
      accent,
      random: input.random === true,
    });

    return toolOk({
      text: result.text,
      title: result.title,
      notes: 'Use SYNTHESIZE_VOICE_SPEECH with this text and the chosen voice_id.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Speech script assist failed');
  }
}

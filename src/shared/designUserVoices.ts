import { inworldDesignVoice } from '../api-vendors/inworld/designVoice';
import { badRequest } from '../app/response';
import type { UserFileRow, UserVoiceRow } from '../database/types';
import { publishUserVoice } from './publishUserVoice';

export type DesignUserVoicesInput = {
  designPrompt: string;
  previewText: string;
  langCode?: string;
  numberOfSamples?: number;
  baseName?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
};

export type DesignedUserVoice = UserVoiceRow & { files: UserFileRow[] };

export type DesignUserVoicesResult = {
  langCode: string;
  designPrompt: string;
  previewText: string;
  voices: DesignedUserVoice[];
};

function defaultDisplayName(baseName: string | null | undefined, index: number, total: number): string {
  const base = baseName?.trim() || 'My voice';
  return total > 1 ? `${base} ${index + 1}` : base;
}

export async function designAndCreateUserVoices(
  userId: string,
  input: DesignUserVoicesInput
): Promise<DesignUserVoicesResult> {
  const designPrompt = input.designPrompt.trim();
  const previewText = input.previewText.trim();
  if (!designPrompt) throw badRequest('designPrompt is required');
  if (!previewText) throw badRequest('previewText is required');

  const numberOfSamples =
    input.numberOfSamples == null
      ? 3
      : Math.min(3, Math.max(1, Math.round(input.numberOfSamples)));

  const langCode = input.langCode?.trim() || 'EN_US';

  const result = await inworldDesignVoice({
    designPrompt,
    previewText,
    langCode,
    numberOfSamples,
  });

  const previews = result.previewVoices.slice(0, numberOfSamples);
  const voices: DesignedUserVoice[] = [];
  const errors: string[] = [];

  for (let index = 0; index < previews.length; index += 1) {
    const preview = previews[index];
    const displayName = defaultDisplayName(input.baseName, index, previews.length);
    try {
      const published = await publishUserVoice(userId, {
        voiceId: preview.voiceId,
        displayName,
        previewAudio: preview.previewAudio,
        previewText: preview.previewText,
        designPrompt,
        language: result.langCode || langCode,
        gender: input.gender?.trim() || null,
        age: input.age?.trim() || null,
        accent: input.accent?.trim() || null,
        source: 'voice_design',
      });
      voices.push({
        ...published.voice,
        files: [published.file],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save designed voice';
      errors.push(`${displayName}: ${message}`);
    }
  }

  if (voices.length === 0) {
    throw badRequest(
      errors.length > 0
        ? `Voice design previews were generated but could not be saved. ${errors.join(' ')}`
        : 'Voice design returned no previews to save.'
    );
  }

  return {
    langCode: result.langCode,
    designPrompt,
    previewText,
    voices,
  };
}

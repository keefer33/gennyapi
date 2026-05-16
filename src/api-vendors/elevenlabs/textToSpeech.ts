import axios from 'axios';
import { AppError } from '../../app/error';
import { resolveElevenLabsApiKeyFromVendorApis } from './fetchSharedVoices';

export const ELEVENLABS_TTS_MODEL_ID = 'eleven_multilingual_v2';

function ttsUrl(voiceId: string): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
}

function audioBufferFromTtsResponse(data: unknown, contentType: string | undefined): Buffer {
  if (data instanceof ArrayBuffer) {
    const buf = Buffer.from(data);
    if (buf.length > 0) return buf;
  }
  if (Buffer.isBuffer(data) && data.length > 0) return data;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('data:')) {
      const base64 = trimmed.split(',')[1] ?? '';
      if (base64) return Buffer.from(base64, 'base64');
    }
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 100) {
      return Buffer.from(trimmed.replace(/\s/g, ''), 'base64');
    }
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    for (const key of ['audio_base64', 'audio', 'data', 'base64']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        const raw = candidate.trim();
        const base64 = raw.startsWith('data:') ? (raw.split(',')[1] ?? '') : raw;
        if (base64) return Buffer.from(base64, 'base64');
      }
    }
  }

  const hint = contentType ? ` (Content-Type: ${contentType})` : '';
  throw new AppError('Unexpected ElevenLabs TTS response format', {
    statusCode: 502,
    code: 'elevenlabs_tts_invalid_response',
    expose: true,
    details: hint,
  });
}

/**
 * ElevenLabs text-to-speech — returns MP3 bytes (handles raw audio or base64-encoded payloads).
 */
export async function elevenLabsTextToSpeech(
  voiceId: string,
  text: string,
  modelId: string = ELEVENLABS_TTS_MODEL_ID
): Promise<Buffer> {
  const id = voiceId.trim();
  const trimmedText = text.trim();
  if (!id) {
    throw new AppError('voice_id is required', {
      statusCode: 400,
      code: 'elevenlabs_tts_voice_id_missing',
    });
  }
  if (!trimmedText) {
    throw new AppError('text is required', {
      statusCode: 400,
      code: 'elevenlabs_tts_text_missing',
    });
  }

  const apiKey = await resolveElevenLabsApiKeyFromVendorApis();
  const response = await axios.post(
    ttsUrl(id),
    { text: trimmedText, model_id: modelId },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg, application/json',
      },
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    let details: unknown = response.data;
    try {
      const raw = Buffer.from(response.data as ArrayBuffer).toString('utf8');
      details = JSON.parse(raw);
    } catch {
      // keep buffer as details hint
    }
    throw new AppError('ElevenLabs text-to-speech request failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'elevenlabs_tts_failed',
      details,
      expose: true,
    });
  }

  const contentType = String(response.headers['content-type'] ?? '');
  let payload: unknown = response.data;
  if (contentType.includes('application/json')) {
    try {
      payload = JSON.parse(Buffer.from(response.data as ArrayBuffer).toString('utf8'));
    } catch {
      payload = response.data;
    }
  }

  const buffer = audioBufferFromTtsResponse(payload, contentType);
  if (buffer.length === 0) {
    throw new AppError('ElevenLabs returned empty audio', {
      statusCode: 502,
      code: 'elevenlabs_tts_empty_audio',
    });
  }
  return buffer;
}

import { getServerClient } from '../database/supabaseClient';

type FileWithEntityIds = {
  character_id?: string | null;
  voice_id?: string | null;
  character_name?: string | null;
  voice_name?: string | null;
  [key: string]: unknown;
};

type RunWithFiles = {
  user_files?: FileWithEntityIds[] | null;
  [key: string]: unknown;
};

export async function enrichHistoryRunFilesWithEntityNames<T extends RunWithFiles>(
  userId: string,
  runs: T[]
): Promise<T[]> {
  const uid = userId.trim();
  if (!uid || runs.length === 0) return runs;

  const charIds = new Set<string>();
  const voiceIds = new Set<string>();

  for (const run of runs) {
    for (const file of run.user_files ?? []) {
      const cid = file.character_id?.trim();
      const vid = file.voice_id?.trim();
      if (cid) charIds.add(cid);
      if (vid) voiceIds.add(vid);
    }
  }

  if (charIds.size === 0 && voiceIds.size === 0) return runs;

  const { supabaseServerClient } = await getServerClient();
  const charNames = new Map<string, string>();
  const voiceNames = new Map<string, string>();

  if (charIds.size > 0) {
    const { data } = await supabaseServerClient
      .from('user_characters')
      .select('id, name')
      .eq('user_id', uid)
      .in('id', [...charIds]);

    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? '').trim();
      const name = String((row as { name?: string }).name ?? '').trim();
      if (id && name) charNames.set(id, name);
    }
  }

  if (voiceIds.size > 0) {
    const ids = [...voiceIds];
    const { data: userVoices } = await supabaseServerClient
      .from('user_voices')
      .select('id, name')
      .eq('user_id', uid)
      .in('id', ids);

    for (const row of userVoices ?? []) {
      const id = String((row as { id?: string }).id ?? '').trim();
      const name = String((row as { name?: string }).name ?? '').trim();
      if (id && name) voiceNames.set(id, name);
    }

    const missingVoiceIds = ids.filter(id => !voiceNames.has(id));
    if (missingVoiceIds.length > 0) {
      const { data: systemVoices } = await supabaseServerClient
        .from('user_voices')
        .select('id, name')
        .eq('type', 'system')
        .in('id', missingVoiceIds);

      for (const row of systemVoices ?? []) {
        const id = String((row as { id?: string }).id ?? '').trim();
        const name = String((row as { name?: string }).name ?? '').trim();
        if (id && name) voiceNames.set(id, name);
      }
    }
  }

  return runs.map(run => ({
    ...run,
    user_files: (run.user_files ?? []).map(file => {
      const cid = file.character_id?.trim();
      const vid = file.voice_id?.trim();
      return {
        ...file,
        character_name: cid ? (charNames.get(cid) ?? null) : null,
        voice_name: vid ? (voiceNames.get(vid) ?? null) : null,
      };
    }),
  }));
}

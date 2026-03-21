import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

const PROFILE_COLUMNS =
  'id, user_id, first_name, last_name, bio, created_at, updated_at, email, username, token_balance, usage_balance, api_key, meta';

/**
 * PATCH /user/profile
 * Body: { first_name, last_name, bio, username }
 * Authorization: Bearer <app JWT from createToken>
 *
 * Validates username uniqueness (excluding current user), then updates or inserts user_profiles.
 */
export async function patchUserProfile(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const body = req.body ?? {};
    const first_name = typeof body.first_name === 'string' ? body.first_name : '';
    const last_name = typeof body.last_name === 'string' ? body.last_name : '';
    const bio = typeof body.bio === 'string' ? body.bio : '';
    const usernameRaw = typeof body.username === 'string' ? body.username.trim() : '';

    if (!usernameRaw) {
      res.status(400).json({ success: false, error: 'Username is required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: existing, error: existingErr } = await supabaseServerClient
      .from('user_profiles')
      .select('id, username')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingErr) {
      console.error('[patchUserProfile] load:', existingErr.message);
      res.status(500).json({ success: false, error: 'Failed to load profile' });
      return;
    }

    const currentUsername = (existing?.username ?? '').trim();
    if (usernameRaw !== currentUsername) {
      const { count, error: countError } = await supabaseServerClient
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('username', usernameRaw)
        .neq('user_id', user.id);

      if (countError) {
        console.error('[patchUserProfile] username check:', countError.message);
        res.status(500).json({ success: false, error: 'Failed to validate username' });
        return;
      }
      if ((count ?? 0) > 0) {
        res.status(409).json({ success: false, error: 'Username is already taken' });
        return;
      }
    }

    const now = new Date().toISOString();
    const payload = {
      first_name,
      last_name,
      bio,
      username: usernameRaw,
      updated_at: now,
    };

    if (existing?.id) {
      const { error: updateErr } = await supabaseServerClient
        .from('user_profiles')
        .update(payload)
        .eq('id', existing.id);

      if (updateErr) {
        console.error('[patchUserProfile] update:', updateErr.message);
        res.status(500).json({ success: false, error: 'Failed to update profile information' });
        return;
      }
    } else {
      const { error: insertErr } = await supabaseServerClient.from('user_profiles').insert({
        user_id: user.id,
        first_name,
        last_name,
        bio,
        username: usernameRaw,
      });

      if (insertErr) {
        console.error('[patchUserProfile] insert:', insertErr.message);
        res.status(500).json({ success: false, error: 'Failed to create profile information' });
        return;
      }
    }

    const { data: profile, error: fetchErr } = await supabaseServerClient
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !profile) {
      console.error('[patchUserProfile] refetch:', fetchErr?.message);
      res.status(200).json({ success: true, data: { profile: null } });
      return;
    }

    res.status(200).json({ success: true, data: { profile } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[patchUserProfile]', message);
    res.status(500).json({ success: false, error: message });
  }
}

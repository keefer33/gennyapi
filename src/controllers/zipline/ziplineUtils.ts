import { AppError } from '../../app/error';
import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';

type ZiplineProfile = {
  token?: string;
};

function extractZiplineToken(ziplineValue: unknown): string | null {
  if (!ziplineValue || typeof ziplineValue !== 'object') return null;
  const maybeToken = (ziplineValue as ZiplineProfile).token;
  return typeof maybeToken === 'string' && maybeToken.trim().length > 0 ? maybeToken : null;
}

export function getZiplineBaseUrl(): string {
  const baseUrl = process.env.ZIPLINE_URL;
  if (!baseUrl) {
    throw new AppError('Zipline URL not configured', {
      statusCode: 500,
      code: 'zipline_not_configured',
      expose: false,
    });
  }
  return baseUrl;
}

export async function getZiplineTokenForUser(userId: string): Promise<string> {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

  const { data: userProfile, error: profileError } = await supabaseServerClient
    .from('user_profiles')
    .select('zipline')
    .eq('user_id', userId)
    .single();

  if (profileError) {
    throw new AppError(profileError.message || 'Failed to get user profile', {
      statusCode: 500,
      code: 'zipline_profile_fetch_failed',
    });
  }

  const token = extractZiplineToken(userProfile?.zipline);
  if (!token) {
    throw new AppError('Zipline token not configured for user', {
      statusCode: 400,
      code: 'zipline_token_missing',
    });
  }

  return token;
}

export async function getZiplineSuperadminToken(): Promise<string> {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

  const { data: superadmin, error: superadminError } = await supabaseServerClient
    .from('user_profiles')
    .select('zipline')
    .eq('role', 'superadmin')
    .single();

  if (superadminError) {
    throw new AppError(superadminError.message || 'Failed to get superadmin', {
      statusCode: 500,
      code: 'zipline_superadmin_fetch_failed',
      expose: false,
    });
  }

  const token = extractZiplineToken(superadmin?.zipline);
  if (!token) {
    throw new AppError('Superadmin Zipline token is missing', {
      statusCode: 500,
      code: 'zipline_superadmin_token_missing',
      expose: false,
    });
  }

  return token;
}

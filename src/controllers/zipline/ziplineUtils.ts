import { AppError } from '../../app/error';
import { readSuperadminProfileZipline, readUserProfile } from '../../database/user_profiles';

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

/**
 * Zipline DELETE `/api/user/files/:idOrName` expects the path segment from the public URL
 * (e.g. `https://aifile.link/tlgHWK.jpg` → `tlgHWK.jpg`). Only URLs whose origin matches
 * {@link getZiplineBaseUrl} are accepted.
 */
export function ziplineStorageKeyFromPublicUrl(
  fileUrl: string | null | undefined,
  ziplineBaseUrl: string
): string | null {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const normalizedBase = ziplineBaseUrl.replace(/\/+$/, '');
  let baseParsed: URL;
  try {
    baseParsed = new URL(normalizedBase);
  } catch {
    return null;
  }
  if (parsed.origin !== baseParsed.origin) return null;
  const key = parsed.pathname.replace(/^\/+/, '');
  return key || null;
}

export async function getZiplineTokenForUser(userId: string): Promise<string> {
  const userProfile = await readUserProfile(userId, 'zipline');
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
  const superadmin = await readSuperadminProfileZipline();
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

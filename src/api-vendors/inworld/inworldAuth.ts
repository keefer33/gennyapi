import { AppError } from '../../app/error';
import { getVendorApiKeyByVendorName } from '../../database/vendor_apis';

export const INWORLD_VENDOR_NAME = 'inworld';

export async function resolveInworldApiKey(): Promise<string> {
  const fromEnv = process.env.INWORLD_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const vendorRow = await getVendorApiKeyByVendorName(INWORLD_VENDOR_NAME);
  const fromDb = vendorRow?.api_key?.trim();
  if (fromDb) return fromDb;

  throw new AppError('Inworld API key is not configured', {
    statusCode: 500,
    code: 'inworld_api_key_missing',
    expose: false,
  });
}

/** `Authorization` header value for Inworld (`Basic …`). */
export async function inworldAuthorizationHeader(): Promise<string> {
  const key = await resolveInworldApiKey();
  if (key.toLowerCase().startsWith('basic ')) return key;
  return `Basic ${key}`;
}

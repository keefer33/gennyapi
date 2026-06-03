import { AppError } from '../../app/error';
import { getVendorApiKeyByVendorName } from '../../database/vendor_apis';
import { klingCreateJWT } from '../../shared/klingCreateJWT';

export const KLING_VENDOR_NAME = 'kling';
export const DEFAULT_KLING_SERVER = 'https://api-singapore.klingai.com';

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export type KlingVendorConfig = {
  secret_key?: string;
  server?: string;
  element_tag_id?: string;
};

export async function resolveKlingJwt(): Promise<{ jwt: string; server: string; config: KlingVendorConfig }> {
  const vendorRow = await getVendorApiKeyByVendorName(KLING_VENDOR_NAME);
  const accessKey = trimString(vendorRow?.api_key);
  const config = (vendorRow?.config ?? {}) as KlingVendorConfig;
  const secretKey = trimString(config.secret_key);

  if (!accessKey || !secretKey) {
    throw new AppError('Kling API credentials are not configured', {
      statusCode: 500,
      code: 'kling_credentials_missing',
      expose: false,
    });
  }

  const server = trimString(config.server) || DEFAULT_KLING_SERVER;
  return { jwt: klingCreateJWT(accessKey, secretKey), server, config };
}

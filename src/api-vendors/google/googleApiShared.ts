export const DEFAULT_GOOGLE_GEMINI_SERVER = 'https://generativelanguage.googleapis.com/v1beta';
export const GOOGLE_OMNI_PLACEHOLDER_PREFIX = 'google-omni-';
export const GOOGLE_LYRIA_PLACEHOLDER_PREFIX = 'google-lyria-';
export const GOOGLE_LYRIA_API_REVISION = '2026-05-20';
export const GOOGLE_LYRIA_CREATE_TIMEOUT_MS = 10 * 60 * 1000;

export function isGoogleOmniPlaceholderTaskId(taskId: string): boolean {
  return taskId.startsWith(GOOGLE_OMNI_PLACEHOLDER_PREFIX);
}

export function isGoogleLyriaPlaceholderTaskId(taskId: string): boolean {
  return taskId.startsWith(GOOGLE_LYRIA_PLACEHOLDER_PREFIX);
}

export type GoogleApiSchema = {
  server?: string;
  api_path?: string;
  polling_path?: string;
  vendor_model_name?: string;
  request_type?: string;
  polling_method?: string;
};

export function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isLyriaModel(
  vendorModelName: string,
  generationType?: string | null
): boolean {
  if (vendorModelName.toLowerCase().includes('lyria')) return true;
  return (generationType ?? '').trim().toLowerCase() === 'audio';
}

export function isOmniModel(vendorModelName: string, apiSchema: GoogleApiSchema = {}): boolean {
  if (vendorModelName.toLowerCase().includes('lyria')) return false;
  const name = vendorModelName.toLowerCase();
  if (name.includes('omni')) return true;
  const apiPath = trimString(apiSchema.api_path).toLowerCase();
  const requestType = trimString(apiSchema.request_type).toLowerCase();
  return apiPath.includes('/interactions') || requestType === 'interactions';
}

export function isVeoModelName(vendorModelName: string): boolean {
  return vendorModelName.toLowerCase().includes('veo');
}

export function isGoogleVideoModel(
  vendorModelName: string,
  generationType: string | null | undefined,
  apiSchema: GoogleApiSchema = {}
): boolean {
  if (isLyriaModel(vendorModelName, generationType)) return false;
  if (isOmniModel(vendorModelName, apiSchema)) return true;
  if (isVeoModelName(vendorModelName)) return true;
  return generationType === 'video';
}

export function googleLyriaHeaders(apiKey: string): Record<string, string> {
  const resolvedApiKey = apiKey.trim() || process.env.GOOGLE_API_KEY?.trim() || '';
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': resolvedApiKey,
    'Api-Revision': GOOGLE_LYRIA_API_REVISION,
  };
}

export function googleServer(apiSchema: GoogleApiSchema): string {
  return trimString(apiSchema.server) || DEFAULT_GOOGLE_GEMINI_SERVER;
}

export function googleInteractionsEndpoint(apiSchema: GoogleApiSchema): string {
  const apiPath = trimString(apiSchema.api_path);
  if (apiPath) return `${googleServer(apiSchema)}${apiPath}`;
  return `${googleServer(apiSchema)}/interactions`;
}

export function googleOmniPollingEndpoint(apiSchema: GoogleApiSchema, interactionId: string): string {
  const server = googleServer(apiSchema);
  const pollingPath = trimString(apiSchema.polling_path);
  if (pollingPath) {
    if (pollingPath.includes('{interactionId}')) {
      return `${server}${pollingPath.replace('{interactionId}', encodeURIComponent(interactionId))}`;
    }
    return `${server}${pollingPath}${pollingPath.endsWith('/') ? '' : '/'}${encodeURIComponent(interactionId)}`;
  }
  return `${server}/interactions/${encodeURIComponent(interactionId)}`;
}

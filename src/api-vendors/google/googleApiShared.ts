export const DEFAULT_GOOGLE_GEMINI_SERVER = 'https://generativelanguage.googleapis.com/v1beta';
export const GOOGLE_OMNI_PLACEHOLDER_PREFIX = 'google-omni-';

export function isGoogleOmniPlaceholderTaskId(taskId: string): boolean {
  return taskId.startsWith(GOOGLE_OMNI_PLACEHOLDER_PREFIX);
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

export function isOmniModel(vendorModelName: string, apiSchema: GoogleApiSchema = {}): boolean {
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
  if (isOmniModel(vendorModelName, apiSchema)) return true;
  if (isVeoModelName(vendorModelName)) return true;
  return generationType === 'video';
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

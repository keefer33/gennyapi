export const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

export type GetToolkitsQuery = {
    category?: string;
    managed_by?: 'composio' | 'all' | 'project';
    sort_by?: 'usage' | 'alphabetically';
    include_deprecated?: boolean;
    search?: string;
    limit?: number;
    cursor?: string;
  };

  export type GetToolsQuery = {
    toolkit_slug?: string;
    tool_slugs?: string;
    auth_config_ids?: string;
    important?: 'true' | 'false';
    tags?: string | string[];
    scopes?: string | string[] | null;
    query?: string;
    search?: string;
    include_deprecated?: boolean;
    toolkit_versions?: string;
    limit?: number;
    cursor?: string;
  };

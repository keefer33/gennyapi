export type ApiSchemaShape = {
  server?: string;
  api_path?: string;
};

export type VendorApiKeyRow = {
  key?: string | null;
  config?: unknown;
};

export type PlaygroundModelRow = {
  id: string;
  model_id: string | null;
  model_name: string | null;
  model_description: string | null;
  model_type: string | null;
  brand_name: string | null;
  brands?: {
    slug?: string | null;
    name?: string | null;
    logo?: string | null;
  } | null;
  model_pricing: unknown;
  api_schema: unknown;
  function_schema: unknown;
  sort_order: number | null;
};

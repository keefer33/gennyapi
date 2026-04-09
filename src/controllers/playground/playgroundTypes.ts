export type ApiSchemaShape = {
  type?: string;
  method?: string;
  server?: string;
  api_path?: string;
  vendor_model_name?: string;
};

export type VendorApiKeyRow = {
  key?: string | null;
  config?: unknown;
};

export type GenModels = {
  id: string;
  model_id: string | null;
  model_name: string | null;
  model_description: string | null;
  model_type: string | null;
  model_product?: string | null;
  model_variant?: string | null;
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

export type PlaygroundModelRow = GenModels;

export type UserGenModelRuns = {
  id?: string | null;
  user_id?: string;
  gen_model_id?: string | null;
  payload?: unknown;
  response?: unknown;
  task_id?: string | null;
  status?: string | null;
  polling_response?: unknown;
  duration?: number | null;
  cost?: number | null;
  generation_type?: string | null;
  api_schema?: unknown;
};

export type PlaygroundModelLookup = {
  id: string;
  model_id: string | null;
  api_schema: unknown;
};

export type VendorApiLookup = {
  key?: string | null;
  vendor?: string | null;
  config?: unknown;
};

export type VendorApiConfig = {
  apiKey: string;
  vendor: string;
};

export type CreateUserGenModelRunInput = {
  user_id: string;
  gen_model_id?: string | null;
  payload?: unknown;
  response?: unknown;
  task_id?: string | null;
  status?: string | null;
  polling_response?: unknown;
  duration?: number | null;
  cost?: number | null;
  generation_type?: string | null;
};

export type CreateUserGenModelRunResult = {
  id: string;
  created_at: string;
};

/** Row for GET /playground/runs (list history). */
export type UserGenModelRunListRow = {
  id: string;
  created_at: string;
  user_id: string;
  gen_model_id: string | null;
  status: string | null;
  task_id: string | null;
  cost: number | null;
  duration: number | null;
  generation_type: string | null;
  gen_models: {
    model_name: string | null;
    model_id: string | null;
    brand_name: string | null;
    model_product: string | null;
    model_variant: string | null;
  } | null;
};

export type WavespeedRunResponse = {
  id?: string;
  [key: string]: unknown;
} | null;

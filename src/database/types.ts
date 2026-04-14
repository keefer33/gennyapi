export type VendorApisRow = {
  id?: string | null;
  created_at?: string | null;
  vendor_name?: string | null;
  api_key?: string | null;
  config?: any;
};

export type GenModelRow = {
  id?: string | null;
  model_id?: string | null;
  model_name?: string | null;
  model_description?: string | null;
  model_type?: string | null;
  model_product?: string | null;
  model_variant?: string | null;
  brand_name?: string | null;
  brands?: {
    slug?: string | null;
    name?: string | null;
    logo?: string | null;
  } | null;
  model_pricing?: unknown;
  api_schema?: unknown;
  function_schema?: unknown;
  sort_order?: number | null;
  vendor_api?: VendorApisRow;
};

export type CreateUserGenModelRunResult = {
  id: string;
  created_at: string;
};

export type UserGenModelRuns = {
  id?: string | null;
  created_at?: string | null;
  user_id?: string | null;
  gen_model_id?: string;
  status?: string | null;
  task_id?: string | null;
  cost?: number | null;
  duration?: number | null;
  generation_type?: string | null;
  gen_models?: GenModelRow | null;
  payload?: unknown;
  response?: unknown;
  polling_response?: unknown;
};

export type UserGenModelRunListRow = UserGenModelRuns & {
  thumbnail_url: string | null;
  preview_urls: string[];
  preview_file_types: string[];
  preview_files: Array<{ id: string; file_name: string }>;
};

export type UserFileEmbed = {
  id?: string;
  file_name?: string | null;
  created_at?: string;
  thumbnail_url?: string | null;
  file_path?: string | null;
  file_type?: string | null;
};

export type GenModelEmbed = NonNullable<UserGenModelRunListRow['gen_models']>;

export type UserFileRow = {
  id?: string | null;
  file_path?: string | null;
  thumbnail_url?: string | null;
  file_name?: string | null;
};
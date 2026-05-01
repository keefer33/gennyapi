/** `usage_log_types.id` for promo credits (seed: credit / promo, id 1). */
export const USAGE_LOG_TYPE_PROMO_CREDIT = 1;

/** `usage_log_types.id` for Stripe deposit credits (seed: credit / deposit, id 2). */
export const USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT = 2;

/** `usage_log_types.id` for generation / AI usage debits (seed: debit / ai_modal_usage). */
export const USAGE_LOG_TYPE_AI_MODEL_USAGE = 3;

/** `usage_log_types.id` for refund credit when a generation moves to `error` (replaces DB trigger; default id 4). */
export const USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT = 4;

export const USAGE_LOG_TYPES = [
  { id: 1, log_type: 'credit', reason_code: 'promo', meta: null },
  { id: 2, log_type: 'credit', reason_code: 'deposit', meta: null },
  { id: 3, log_type: 'debit', reason_code: 'ai_modal_usage', meta: null },
  { id: 4, log_type: 'credit', reason_code: 'ai_model_error_refund', meta: null },
];

/** Pricing / schemas / vendor keys live on `gen_models_apis`; join for API responses. */
export const PLAYGROUND_LIST_SELECT = `
  id,
  model_id,
  model_name,
  model_description,
  model_type,
  generation_type,
  model_product,
  model_variant,
  brand_name(id, name, slug, logo),
  sort_order,
  sort_order_variant,
  gen_models_apis_id,
  gen_models_apis!gen_models_gen_models_apis_id_fkey (
    id,
    api_schema,
    function_schema,
    model_pricing,
    vendor_apis:vendor_apis!gen_models_apis_vendor_api_fkey (vendor_name, api_key, config)
  )
`;

export const RUN_HISTORY_SELECT = `
  id,
  created_at,
  user_id,
  gen_model_id(
    id,
    model_name,
    model_id,
    brand_name(name,logo),
    model_product,
    model_variant,
    generation_type,
    gen_models_apis_id(*,vendor_api(*))
  ),
  status,
  task_id,
  cost,
  duration,
  user_files(*),
  payload,
  response,
  polling_response
`;

export const RUN_HISTORY_LIST_SELECT = `
  id,
  created_at,
  user_id,
  gen_model_id(
    id,
    model_name,
    model_id,
    brand_name(name,logo),
    model_product,
    model_variant,
    generation_type
  ),
  status,
  task_id,
  cost,
  duration,
  user_files!gen_model_run_id(id, file_name, thumbnail_url, file_path, file_size, file_type, created_at, status, generated_info),
  polling_response
`;

export const RUN_AGENT_SELECT = `
  id,
  created_at,
  status,
  cost,
  duration,
  gen_models:gen_models!gen_model_id(
    model_name,
    model_id,
    brand_name,
    model_product,
    model_variant,
    generation_type,
    gen_models_apis!gen_models_gen_models_apis_id_fkey (vendor_api)
  ),
  user_files!gen_model_run_id(id, file_name, thumbnail_url, file_path, file_size, file_type, created_at),
  payload,
  response,
  polling_response
`;

  export const USAGE_LOG_SELECT = `
  *,
  usage_log_types (
    id,
    log_type,
    reason_code
  ),
  user_gen_model_runs!gen_model_run_id (
    id,
    gen_model_id,
    gen_models:gen_models!gen_model_id (
      model_name,
      model_id,
      brand_name,
      model_product,
      model_variant
    )
  ),
  transactions (
    id,
    amount_dollars,
    amount_cents
  )
`;

export const FILE_SELECT = `
  id,
  file_name,
  file_path,
  file_size,
  file_type,
  created_at,
  status,
  generated_info,
  upload_type,
  thumbnail_url,
  user_file_tags(
    tag_id,
    created_at,
    user_tags(*)
  )
`;

export const GEN_MODEL_DETAIL_SELECT = `
  id,
  model_id,
  model_name,
  model_description,
  model_type,
  generation_type,
  model_product,
  model_variant,
  brand_name(id, name, slug, logo),
  sort_order,
  sort_order_variant,
  gen_models_apis_id(
    id,
    api_schema,
    function_schema,
    model_pricing,
    vendor_api(id, vendor_name, api_key, config)
  )
`;
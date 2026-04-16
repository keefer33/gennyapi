export type VendorApisRow = {
  id?: string | null;
  created_at?: string | null;
  vendor_name?: string | null;
  api_key?: string | null;
  config?: any;
};

/** Matches `public.vendor_apis` */
export type VendorApiRow = {
  id?: string | null;
  created_at?: string | null;
  vendor_name?: string | null;
  api_key?: string | null;
  config?: unknown | null;
};

export type BrandRow = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  logo?: string | null;
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
  brands?: BrandRow | null;
  model_pricing?: unknown;
  api_schema?: unknown | null;
  function_schema?: unknown;
  sort_order?: number | null;
  vendor_api?: VendorApisRow;
  vendor_name?: string | null;
};

export type CreateUserGenModelRunResult = {
  id?: string | null ;
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
  gen_models?: GenModelRow | null;
  payload?: unknown;
  response?: unknown;
  polling_response?: unknown;
};

export type UserGenModelRunListRow = UserGenModelRuns & {
  thumbnail_url?: string | null;
  preview_urls?: string[];
  preview_file_types?: string[];
  preview_files?: Array<{ id: string; file_name: string }>;
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
  user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  file_path?: string | null;
  thumbnail_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  status?: string | null;
  upload_type?: string | null;
  zip_data?: unknown | null;
  model_id?: string | null;
  agent_id?: string | null;
  generated_info?: unknown | null;
  gen_model_id?: string | null;
  gen_model_run_id?: string | null;
};

/** Matches `public.user_tags` */
export type UserTagRow = {
  id?: string | null;
  created_at?: string | null;
  user_id?: string | null;
  tag_name?: string | null;
  tag_type?: string | null;
};

/** Matches `public.user_file_tags` */
export type UserFileTagRow = {
  file_id?: string | null;
  tag_id?: string | null;
  created_at?: string | null;
  user_tags?: UserTagRow | null;
};

export type UsageLogTypesRow = {
  id?: number | null;
  log_type?: string | null;
  reason_code?: string | null;
  meta?: unknown;
};

export type UserUsageLogRow = {
  id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  usage_amount?: number | null;
  gen_model_run_id?: GenModelRow | string | null;
  transaction_id?: TransactionRow | string | null;
  type_id?: UsageLogTypesRow | number | null;
  promotion_id?: PromotionRow | string | null;
  meta?: unknown | null;
};

/** Matches `public.user_profiles` */
export type UserProfileRow = {
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  email?: string | null;
  username?: string | null;
  zipline?: unknown | null;
  phone?: string | null;
  role?: string | null;
  api_key?: string | null;
  meta?: unknown | null;
  usage_balance?: number | null;
};

/** `user_models_chats` / `user_models_chats_messages` */
export type SortOrder = "asc" | "desc";

export interface ChatRow {
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user_id?: string | null;
  chat_name?: string | null;
}

export interface ChatMessageContentPart {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface ChatMessageEnvelope {
  role: string;
  content?: ChatMessageContentPart[];
}

export interface MessageRow {
  message: ChatMessageEnvelope;
}

export interface ChatMessageRow {
  id: string;
  created_at: string;
  chat_id: string;
  message: unknown;
  usage: unknown;
}

export type ListChatMessagesOptions = {
  limit?: number;
  order?: SortOrder;
};

export type CreateChatBody = {
  chat_name?: string;
};

export type UpdateChatBody = {
  chat_name?: string;
};

export type CreateChatMessageBody = {
  message: unknown;
  usage?: unknown;
};

export type PromotionRow = {
  id: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  promo_code: string | null;
  title: string | null;
  description: string | null;
  token_amount: number | null;
  dollar_amount: number | null;
  meta_data: unknown | null;
};

/** Matches `public.transactions` */
export type TransactionRow = {
  id?: string | null;
  user_id?: string | null;
  stripe_payment_intent_id?: string | null;
  amount_cents?: number | null;
  amount_dollars?: number | null;
  tokens_purchased?: number | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  metadata?: unknown | null;
};

export type SupportTicketStatus = 'opened' | 'closed';

/** Matches `public.user_support_tickets` */
export type UserSupportTicketRow = {
  id?: string | null;
  created_at?: string | null;
  user_id?: string | null;
  status?: SupportTicketStatus | null;
};

/** Matches `public.user_support_tickets_threads` */
export type UserSupportTicketThreadRow = {
  id?: string | null;
  created_at?: string | null;
  ticket_id?: string | null;
  user_id?: string | null;
  message?: string | null;
};

export type AgentModelRow = {
  id?: string;
  created_at?: string;
  updated_at?: string;
  brand_name: BrandRow;
  model_name?: string;
  description?: string | null;
  api_id?: AgentModelApiRow | null;
  meta?: Object | null | any;
  order?: number | null;
  model_type?: string | null;
};

/** Matches `public.agent_models_apis` */
export type AgentModelApiRow = {
  id?: string;
  created_at?: string;
  model_name?: string | null;
  api_type?: string;
  pricing?: Object | null | any;
  schema?: Object | null | any;
  meta?: Object | null | any;
  vendor_key?: VendorApisRow | null;
};

export type ListUserFilesParams = {
  userId: string;
  page: number;
  limit: number;
  tagIds: string[];
  uploadType: string | null;
  fileTypeFilter: string;
};

export type ListUserFilesResult = {
  files: unknown[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};
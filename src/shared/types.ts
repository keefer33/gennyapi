import { Request } from 'express';

export type ServiceResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: string };

export type EmptyServiceResult = { error?: never } | { error: string };

export type RequestWithUser = Request & {
  user?: {
    id?: string;
    authToken?: string;
  };
};

export type UserUsageLogInsertInput = {
  user_id?: string;
  usage_amount?: number | string;
  generation_id?: string | null;
  transaction_id?: string | null;
  type_id?: number | null;
  promotion_id?: string | null;
  meta?: Record<string, unknown> | null;
};

export type UserUsageLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  usage_amount: number;
  generation_id: string | null;
  transaction_id: string | null;
  type_id: number | null;
  promotion_id: string | null;
  meta: Record<string, unknown> | null;
};

export type UpdateUsageAmountInput = {
  user_id?: string;
  type?: 'credit' | 'debit';
  amount?: number | string;
};
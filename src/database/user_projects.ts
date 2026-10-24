import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { UserProjectRow } from './types';

const USER_PROJECTS_INSERT_KEYS = [
  'user_id',
  'project_name',
  'project_brief',
  'metadata',
  'chat_id',
] as const;

export function displayProjectName(project: Pick<UserProjectRow, 'project_name'> | null | undefined): string {
  return String(project?.project_name ?? '').trim() || 'Untitled project';
}

const USER_PROJECTS_UPDATE_KEYS = ['project_name', 'project_brief', 'metadata'] as const;

export async function createUserProjectRow(row: Partial<UserProjectRow>): Promise<UserProjectRow> {
  const { supabaseServerClient } = await getServerClient();
  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_PROJECTS_INSERT_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  const { data, error } = await supabaseServerClient
    .from('user_projects')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_project_create_failed',
    });
  }

  return data as UserProjectRow;
}

export async function listUserProjectsForUser(userId: string): Promise<UserProjectRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_projects_list_failed',
    });
  }

  return (data as UserProjectRow[]) ?? [];
}

export async function getUserProjectForUser(
  userId: string,
  projectId: string
): Promise<UserProjectRow | null> {
  const id = projectId.trim();
  if (!id) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_project_fetch_failed',
    });
  }

  return (data as UserProjectRow | null) ?? null;
}

export async function getUserProjectByChatIdForUser(
  userId: string,
  chatId: string
): Promise<UserProjectRow | null> {
  const id = chatId.trim();
  if (!id) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_projects')
    .select('*')
    .eq('chat_id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_project_fetch_by_chat_failed',
    });
  }

  return (data as UserProjectRow | null) ?? null;
}

export async function updateUserProjectRow(
  userId: string,
  projectId: string,
  row: Partial<UserProjectRow>
): Promise<UserProjectRow> {
  const id = projectId.trim();
  if (!id) {
    throw new AppError('projectId is required', {
      statusCode: 400,
      code: 'project_id_missing',
      expose: true,
    });
  }

  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_PROJECTS_UPDATE_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError('No fields to update', {
      statusCode: 400,
      code: 'user_project_update_empty',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_projects')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Project not found', {
        statusCode: 404,
        code: 'project_not_found',
        expose: true,
      });
    }
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_project_update_failed',
    });
  }

  return data as UserProjectRow;
}

export async function deleteUserProjectForUser(userId: string, projectId: string): Promise<void> {
  const id = projectId.trim();
  if (!id) {
    throw new AppError('projectId is required', {
      statusCode: 400,
      code: 'project_id_missing',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_projects')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_project_delete_failed',
    });
  }
}

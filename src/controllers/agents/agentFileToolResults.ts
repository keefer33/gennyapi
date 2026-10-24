import axios from 'axios';
import { getUserProjectForUser } from '../../database/user_projects';
import { listProjectTaggedFiles } from '../../database/projectFileTags';
import {
  createUserFileRow,
  deleteUserFileForUser,
  getActiveUserFileByUrlForUser,
  getActiveUserFileForUpdate,
  getUserFileByIdFullForUser,
  listUserFilesData,
  updateUserFileName,
} from '../../database/user_files';
import {
  createUserTagRow,
  getUserTagByIdForUser,
  getUserTagByNameForUser,
  listUserTagsByUser,
} from '../../database/user_tags';
import { createUserFileTagLink, deleteUserFileTagLink, listTagsForFile } from '../../database/user_file_tags';
import type { UserFileRow, UserFileTagRow, UserTagRow } from '../../database/types';
import { getZiplineTokenForUser } from '../zipline/ziplineUtils';
import { generateThumbnail, isImageUrl, isVideoUrl } from '../../shared/fileUtils';
import { getZipData, uploadFileToZipline } from '../../shared/ziplineApi';

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function tagNamesFromFile(row: UserFileRow): string[] {
  const links = (row as UserFileRow & { user_file_tags?: UserFileTagRow[] }).user_file_tags;
  if (!Array.isArray(links)) return [];
  const names: string[] = [];
  for (const link of links) {
    const name = stringValue(link.user_tags?.tag_name);
    if (name) names.push(name);
  }
  return names;
}

function slimFile(row: UserFileRow, tags?: string[]): Record<string, unknown> {
  return {
    id: row.id ?? null,
    file_name: row.file_name ?? null,
    file_path: row.file_path ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    file_type: row.file_type ?? null,
    file_size: row.file_size ?? null,
    upload_type: row.upload_type ?? null,
    tags: tags ?? tagNamesFromFile(row),
  };
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(last) || 'upload.bin';
  } catch {
    return 'upload.bin';
  }
}

async function findOrCreateTag(userId: string, tagName: string): Promise<UserTagRow | null> {
  const name = tagName.trim();
  if (!name) return null;
  const existing = await getUserTagByNameForUser(userId, name);
  if (existing?.id) return existing;
  try {
    return await createUserTagRow(userId, name);
  } catch {
    return getUserTagByNameForUser(userId, name);
  }
}

async function applyTagNames(userId: string, fileId: string, names: string[]): Promise<string[]> {
  const applied: string[] = [];
  for (const raw of names) {
    const tag = await findOrCreateTag(userId, raw);
    const tagId = stringValue(tag?.id);
    const tagName = stringValue(tag?.tag_name) || raw.trim();
    if (!tagId) continue;
    try {
      await createUserFileTagLink(fileId, tagId);
      applied.push(tagName);
    } catch {
      applied.push(tagName);
    }
  }
  return applied;
}

export async function listUserFilesToolResult(
  userId: string,
  input: { project_id?: string; page?: number; limit?: number }
): Promise<Record<string, unknown>> {
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));
  const projectId = stringValue(input.project_id);

  try {
    if (projectId) {
      const project = await getUserProjectForUser(userId, projectId);
      if (!project?.id) {
        return { success: false, message: 'Project not found' };
      }
      const result = await listProjectTaggedFiles(userId, project, page, limit);
      const files = result.files.map(row => slimFile(row));
      return {
        success: true,
        files,
        total: result.total,
        page: result.currentPage,
        limit,
      };
    }

    const result = await listUserFilesData({
      userId,
      page,
      limit,
      tagIds: [],
      uploadType: null,
      fileTypeFilter: 'all',
    });
    const files = (result.files as UserFileRow[]).map(row => slimFile(row));
    return {
      success: true,
      files,
      total: result.total,
      page: result.currentPage,
      limit,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list files';
    return { success: false, message };
  }
}

export async function getFileToolResult(
  userId: string,
  input: { file_id?: string; file_url?: string }
): Promise<Record<string, unknown>> {
  const fileId = stringValue(input.file_id);
  const fileUrl = stringValue(input.file_url);
  if (!fileId && !fileUrl) {
    return { success: false, message: 'file_id or file_url is required' };
  }

  try {
    const row = fileId
      ? await getUserFileByIdFullForUser(fileId, userId)
      : await getActiveUserFileByUrlForUser(userId, fileUrl);
    if (!row) {
      return { success: false, message: 'File not found' };
    }
    return { success: true, file: slimFile(row) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load file';
    return { success: false, message };
  }
}

export async function uploadFileToolResult(
  userId: string,
  input: { file_url?: string; file_name?: string; tags?: string[] }
): Promise<Record<string, unknown>> {
  const fileUrl = stringValue(input.file_url);
  if (!fileUrl) {
    return { success: false, message: 'file_url is required' };
  }
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return { success: false, message: 'file_url must be a valid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { success: false, message: 'file_url must be http(s)' };
  }

  const fileName = stringValue(input.file_name) || filenameFromUrl(fileUrl);
  const tagNames = Array.isArray(input.tags) ? input.tags.map(stringValue).filter(Boolean) : [];

  try {
    const token = await getZiplineTokenForUser(userId);
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const buffer = Buffer.from(response.data);
    const uploadResponse = await uploadFileToZipline(buffer, fileName, token);
    const uploadedFile = uploadResponse.files?.[0];
    if (!uploadedFile?.url) {
      return { success: false, message: 'Upload failed' };
    }

    const zipData = await getZipData(uploadedFile.id, token);
    let thumbnailUrl: string | undefined;
    const fakeUrlForType = `https://temp/${fileName.toLowerCase()}`;
    if (isImageUrl(fakeUrlForType) || isVideoUrl(fakeUrlForType)) {
      try {
        const thumbnailBuffer = await generateThumbnail(buffer, fakeUrlForType);
        if (thumbnailBuffer) {
          const filenameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
          const thumbRes = await uploadFileToZipline(
            thumbnailBuffer,
            `${filenameWithoutExt}_thumb.jpg`,
            token
          );
          if (thumbRes.files?.[0]?.url) thumbnailUrl = thumbRes.files[0].url;
        }
      } catch {
        // ignore thumbnail errors
      }
    }

    const row = await createUserFileRow({
      user_id: userId,
      file_name: zipData.name || fileName,
      file_path: uploadedFile.url,
      file_size: zipData.size ?? buffer.length,
      file_type: zipData.type || 'application/octet-stream',
      status: 'active',
      upload_type: 'upload',
      thumbnail_url: thumbnailUrl,
    });
    const fileId = stringValue(row.id);
    const tags = fileId ? await applyTagNames(userId, fileId, tagNames) : [];
    const file = slimFile(row, tags);
    return {
      success: true,
      file,
      file_id: file.id,
      url: row.file_path ?? uploadedFile.url,
      file_name: file.file_name,
      file_type: file.file_type,
      thumbnail_url: file.thumbnail_url,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to upload file';
    return { success: false, message };
  }
}

export async function updateFileToolResult(
  userId: string,
  input: { file_id?: string; file_name?: string }
): Promise<Record<string, unknown>> {
  const fileId = stringValue(input.file_id);
  const fileName = stringValue(input.file_name);
  if (!fileId) return { success: false, message: 'file_id is required' };
  if (!fileName) return { success: false, message: 'file_name is required' };

  try {
    const current = await getActiveUserFileForUpdate(fileId, userId);
    if (!current) {
      return { success: false, message: 'File not found' };
    }
    const updated = await updateUserFileName(fileId, userId, fileName);
    return { success: true, file: slimFile(updated) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to rename file';
    return { success: false, message };
  }
}

export async function deleteFileToolResult(
  userId: string,
  file_id: string
): Promise<Record<string, unknown>> {
  const fileId = stringValue(file_id);
  if (!fileId) return { success: false, message: 'file_id is required' };

  try {
    const row = await getUserFileByIdFullForUser(fileId, userId);
    if (!row) {
      return { success: false, message: 'File not found' };
    }
    await deleteUserFileForUser(userId, fileId);
    return {
      success: true,
      file_id: fileId,
      url: row.file_path ?? null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete file';
    return { success: false, message };
  }
}

export async function listUserTagsToolResult(userId: string): Promise<Record<string, unknown>> {
  try {
    const tags = await listUserTagsByUser(userId);
    return {
      success: true,
      tags: tags.map(tag => ({
        tag_id: tag.id ?? null,
        tag_name: tag.tag_name ?? null,
      })),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list tags';
    return { success: false, message };
  }
}

export async function addFileTagsToolResult(
  userId: string,
  input: { file_id?: string; tags?: string[] }
): Promise<Record<string, unknown>> {
  const fileId = stringValue(input.file_id);
  const names = Array.isArray(input.tags) ? input.tags.map(stringValue).filter(Boolean) : [];
  if (!fileId) return { success: false, message: 'file_id is required' };
  if (names.length === 0) return { success: false, message: 'tags is required' };

  try {
    const row = await getUserFileByIdFullForUser(fileId, userId);
    if (!row) {
      return { success: false, message: 'File not found' };
    }
    const added = await applyTagNames(userId, fileId, names);
    const links = await listTagsForFile(fileId);
    const tags = links
      .map(link => stringValue(link.user_tags?.tag_name))
      .filter(Boolean);
    return { success: true, file_id: fileId, added, tags };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add tags';
    return { success: false, message };
  }
}

export async function removeFileTagsToolResult(
  userId: string,
  input: { file_id?: string; tags?: string[] }
): Promise<Record<string, unknown>> {
  const fileId = stringValue(input.file_id);
  const needles = Array.isArray(input.tags) ? input.tags.map(stringValue).filter(Boolean) : [];
  if (!fileId) return { success: false, message: 'file_id is required' };
  if (needles.length === 0) return { success: false, message: 'tags is required' };

  try {
    const row = await getUserFileByIdFullForUser(fileId, userId);
    if (!row) {
      return { success: false, message: 'File not found' };
    }

    const removed: string[] = [];
    for (const needle of needles) {
      const byId = await getUserTagByIdForUser(needle, userId);
      const tag = byId ?? (await getUserTagByNameForUser(userId, needle));
      const tagId = stringValue(tag?.id);
      if (!tagId) continue;
      await deleteUserFileTagLink(fileId, tagId);
      removed.push(stringValue(tag?.tag_name) || needle);
    }

    const links = await listTagsForFile(fileId);
    const tags = links
      .map(link => stringValue(link.user_tags?.tag_name))
      .filter(Boolean);
    return { success: true, file_id: fileId, removed, tags };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove tags';
    return { success: false, message };
  }
}

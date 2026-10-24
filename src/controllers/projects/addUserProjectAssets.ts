import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { addProjectTaggedAssets, collectAssetPatchIds } from '../../database/projectFileTags';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseProjectId } from './helpers';

/**
 * POST /projects/:projectId/assets
 * Body: { files?: [{ id }], generation_ids?: string[] }
 * Tags those user_files with the project name tag.
 */
export async function addUserProjectAssets(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const projectId = parseProjectId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const targets = collectAssetPatchIds(body);
    if (targets.fileIds.length === 0 && targets.generationIds.length === 0) {
      throw badRequest('At least one file or generation is required');
    }

    const { project, changed } = await addProjectTaggedAssets(userId, projectId, {
      files: targets.fileIds.map(id => ({ id })),
      generation_ids: targets.generationIds,
    });

    sendOk(res, { project, changed });
  } catch (error) {
    sendError(res, error);
  }
}

import { AppError } from '../../app/error';
import { getActiveUserFileByUrlForUser, getUserFilesByRunId } from '../../database/user_files';
import { isDraftCacheLibraryFile } from '../../shared/fileUtils';

export async function resolveBflDraftCacheUrl(userId: string, mediaUrl: string): Promise<string> {
  const url = mediaUrl.trim();
  if (!url) {
    throw new AppError('Pick a FLUX 3 draft video to enhance.', {
      statusCode: 400,
      code: 'bfl_draft_video_required',
      expose: true,
    });
  }
  if (isDraftCacheLibraryFile({ file_path: url, file_name: url })) return url;

  const videoFile = await getActiveUserFileByUrlForUser(userId, url);
  const runId = typeof videoFile?.gen_model_run_id === 'string' ? videoFile.gen_model_run_id.trim() : '';
  if (!runId) {
    throw new AppError('That file is not a FLUX 3 draft. Generate a clip with Draft on, then enhance that video.', {
      statusCode: 400,
      code: 'bfl_draft_video_not_found',
      expose: true,
    });
  }

  const siblings = await getUserFilesByRunId(runId);
  const cache = siblings.find(file => isDraftCacheLibraryFile(file) && file.file_path?.trim());
  const cacheUrl = cache?.file_path?.trim() ?? '';
  if (!cacheUrl) {
    throw new AppError('No draft cache is saved for that video. Only clips generated with Draft on can be enhanced.', {
      statusCode: 400,
      code: 'bfl_draft_cache_missing',
      expose: true,
    });
  }
  return cacheUrl;
}

import { AppError } from '../../app/error';
import { listUserStoryboardScenesForStoryboard } from '../../database/user_storyboard_scenes';
import { getUserStoryboardForUser } from '../../database/user_storyboards';
import type { UserStoryboardSceneRow } from '../../database/types';

const DEFAULT_STORYBOARD_WIDTH = 1920;
const DEFAULT_STORYBOARD_HEIGHT = 1080;
const DEFAULT_STORYBOARD_FPS = 24;
const DEFAULT_SCENE_DURATION_FRAMES = 90;

type SceneBackgroundType = 'video' | 'image' | 'color';

type RenderLayer = {
  id: string;
  durationInFrames: number;
  from: number;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  content?: unknown;
};

export type StoryboardRenderScene = {
  durationInFrames: number;
  background: {
    type: SceneBackgroundType;
    value: string;
  };
  layers: RenderLayer[];
};

export type StoryboardRenderInputProps = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  scenes: StoryboardRenderScene[];
};

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function parseStoryboardSettings(settings: unknown): {
  width: number;
  height: number;
  fps: number;
} {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {
      width: DEFAULT_STORYBOARD_WIDTH,
      height: DEFAULT_STORYBOARD_HEIGHT,
      fps: DEFAULT_STORYBOARD_FPS,
    };
  }
  const raw = settings as Record<string, unknown>;
  return {
    width: parsePositiveInt(raw.width, DEFAULT_STORYBOARD_WIDTH),
    height: parsePositiveInt(raw.height, DEFAULT_STORYBOARD_HEIGHT),
    fps: parsePositiveInt(raw.fps, DEFAULT_STORYBOARD_FPS),
  };
}

function parseSceneDurationInFrames(scene: unknown): number {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    return DEFAULT_SCENE_DURATION_FRAMES;
  }
  const raw = scene as Record<string, unknown>;
  return parsePositiveInt(raw.durationInFrames, DEFAULT_SCENE_DURATION_FRAMES);
}

function parseSceneBackground(scene: unknown): { type: SceneBackgroundType; value: string } {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    return { type: 'video', value: '' };
  }
  const background = (scene as Record<string, unknown>).background;
  if (!background || typeof background !== 'object' || Array.isArray(background)) {
    return { type: 'video', value: '' };
  }
  const raw = background as Record<string, unknown>;
  const type = raw.type;
  const value = typeof raw.value === 'string' ? raw.value : '';
  if (type === 'video' || type === 'image' || type === 'color') {
    return { type, value };
  }
  return { type: 'video', value };
}

function isValidLayer(value: unknown): value is RenderLayer & { isDragging?: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.id === 'string' &&
    typeof raw.durationInFrames === 'number' &&
    typeof raw.from === 'number' &&
    typeof raw.left === 'number' &&
    typeof raw.top === 'number' &&
    typeof raw.width === 'number' &&
    typeof raw.height === 'number' &&
    typeof raw.color === 'string'
  );
}

function sanitizeLayerForRender(layer: RenderLayer & { isDragging?: boolean }): RenderLayer {
  const content = layer.content;
  return {
    id: layer.id,
    durationInFrames: Math.max(1, Math.round(layer.durationInFrames)),
    from: Math.max(0, Math.round(layer.from)),
    left: Math.round(layer.left),
    top: Math.round(layer.top),
    width: Math.max(1, Math.round(layer.width)),
    height: Math.max(1, Math.round(layer.height)),
    color: layer.color,
    ...(content !== undefined ? { content } : {}),
  };
}

function parseSceneLayers(scene: unknown): RenderLayer[] {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return [];
  const background = (scene as Record<string, unknown>).background;
  if (!background || typeof background !== 'object' || Array.isArray(background)) return [];
  const layers = (background as Record<string, unknown>).layers;
  if (!Array.isArray(layers)) return [];
  return layers.filter(isValidLayer).map(sanitizeLayerForRender);
}

function parseSceneRow(row: UserStoryboardSceneRow): StoryboardRenderScene {
  const scene = row.scene;
  return {
    durationInFrames: parseSceneDurationInFrames(scene),
    background: parseSceneBackground(scene),
    layers: parseSceneLayers(scene),
  };
}

export async function buildStoryboardRenderInputProps(
  userId: string,
  storyboardId: string
): Promise<StoryboardRenderInputProps> {
  const id = storyboardId.trim();
  const storyboard = await getUserStoryboardForUser(userId, id);
  if (!storyboard) {
    throw new AppError('Storyboard not found', {
      statusCode: 404,
      code: 'storyboard_not_found',
      expose: true,
    });
  }

  const sceneRows = await listUserStoryboardScenesForStoryboard(userId, id);
  if (sceneRows.length === 0) {
    throw new AppError('Storyboard has no scenes to render', {
      statusCode: 400,
      code: 'storyboard_no_scenes',
      expose: true,
    });
  }

  const settings = parseStoryboardSettings(storyboard.settings);
  const scenes = sceneRows.map(parseSceneRow);
  const durationInFrames = scenes.reduce((total, scene) => total + scene.durationInFrames, 0);

  return {
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    durationInFrames: Math.max(1, durationInFrames),
    scenes,
  };
}

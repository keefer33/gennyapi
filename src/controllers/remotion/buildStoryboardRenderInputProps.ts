import { AppError } from '../../app/error';
import { listUserStoryboardScenesForStoryboard } from '../../database/user_storyboard_scenes';
import { getUserStoryboardForUser } from '../../database/user_storyboards';
import type { UserStoryboardSceneRow } from '../../database/types';

const DEFAULT_STORYBOARD_WIDTH = 1920;
const DEFAULT_STORYBOARD_HEIGHT = 1080;
const DEFAULT_STORYBOARD_FPS = 24;
const DEFAULT_SCENE_DURATION_FRAMES = 90;
const DEFAULT_TRANSITION_DURATION_FRAMES = 15;

type SceneBackgroundType = 'video' | 'image' | 'color';

const TRANSITION_PRESENTATIONS = [
  'fade',
  'slide',
  'wipe',
  'flip',
  'clockWipe',
  'iris',
] as const;

type TransitionPresentationType = (typeof TRANSITION_PRESENTATIONS)[number];

type CardinalDirection = 'from-left' | 'from-top' | 'from-right' | 'from-bottom';
type WipeDirection =
  | CardinalDirection
  | 'from-top-left'
  | 'from-top-right'
  | 'from-bottom-left'
  | 'from-bottom-right';
type TransitionDirection = WipeDirection;

const CARDINAL_DIRECTIONS = new Set<string>([
  'from-left',
  'from-top',
  'from-right',
  'from-bottom',
]);
const WIPE_DIRECTIONS = new Set<string>([
  ...CARDINAL_DIRECTIONS,
  'from-top-left',
  'from-top-right',
  'from-bottom-left',
  'from-bottom-right',
]);
const PRESENTATION_SET = new Set<string>(TRANSITION_PRESENTATIONS);

type TransitionSoundEffectId =
  | 'whoosh'
  | 'whip'
  | 'pageTurn'
  | 'uiSwitch'
  | 'mouseClick'
  | 'shutterModern'
  | 'shutterOld'
  | 'ding'
  | 'recordScratch'
  | 'skedaddle'
  | 'snapchatNotification'
  | 'loadingLag'
  | 'macQuack'
  | 'wilhelmScream'
  | 'boneCrack'
  | 'animeWow'
  | 'yippee'
  | 'bruh'
  | 'vineBoom'
  | 'windowsXpError'
  | 'fah'
  | 'spongebobFail'
  | 'omgHellNah'
  | 'priceIsRightFail'
  | 'romanceMeme'
  | 'nellyAhh'
  | 'sanctuaryGuardianWhat'
  | 'minecraftHurt'
  | 'ohMyGodVine'
  | 'illuminatiConfirmed'
  | 'dramaticBoomer'
  | 'triggered';

const TRANSITION_SOUND_EFFECT_IDS = new Set<string>([
  'whoosh',
  'whip',
  'pageTurn',
  'uiSwitch',
  'mouseClick',
  'shutterModern',
  'shutterOld',
  'ding',
  'recordScratch',
  'skedaddle',
  'snapchatNotification',
  'loadingLag',
  'macQuack',
  'wilhelmScream',
  'boneCrack',
  'animeWow',
  'yippee',
  'bruh',
  'vineBoom',
  'windowsXpError',
  'fah',
  'spongebobFail',
  'omgHellNah',
  'priceIsRightFail',
  'romanceMeme',
  'nellyAhh',
  'sanctuaryGuardianWhat',
  'minecraftHurt',
  'ohMyGodVine',
  'illuminatiConfirmed',
  'dramaticBoomer',
  'triggered',
]);

const DEFAULT_TRANSITION_SOUND_EFFECT: TransitionSoundEffectId = 'whoosh';

const REMOTION_SFX_URL_BY_ID: Record<TransitionSoundEffectId, string> = {
  whoosh: 'https://remotion.media/whoosh.wav',
  whip: 'https://remotion.media/whip.wav',
  pageTurn: 'https://remotion.media/page-turn.wav',
  uiSwitch: 'https://remotion.media/switch.wav',
  mouseClick: 'https://remotion.media/mouse-click.wav',
  shutterModern: 'https://remotion.media/shutter-modern.wav',
  shutterOld: 'https://remotion.media/shutter-old.wav',
  ding: 'https://remotion.media/ding.wav',
  bruh: 'https://remotion.media/bruh.wav',
  vineBoom: 'https://remotion.media/vine-boom.wav',
  windowsXpError: 'https://remotion.media/windows-xp-error.wav',
  fah: 'https://remotion.media/fah.wav',
  spongebobFail: 'https://remotion.media/spongebob-fail.wav',
  omgHellNah: 'https://remotion.media/omg-hell-nah.wav',
  priceIsRightFail: 'https://remotion.media/price-is-right-fail.wav',
  romanceMeme: 'https://remotion.media/romance-meme.wav',
  boneCrack: 'https://remotion.media/bone-crack.wav',
  animeWow: 'https://remotion.media/anime-wow.wav',
  yippee: 'https://remotion.media/yippee.wav',
  loadingLag: 'https://remotion.media/loading-lag.wav',
  wilhelmScream: 'https://remotion.media/wilhelm-scream.wav',
  macQuack: 'https://remotion.media/mac-quack.wav',
  skedaddle: 'https://remotion.media/skedaddle.wav',
  snapchatNotification: 'https://remotion.media/snapchat-notification.wav',
  nellyAhh: 'https://remotion.media/nelly-ahh.wav',
  sanctuaryGuardianWhat: 'https://remotion.media/sanctuary-guardian-what.wav',
  minecraftHurt: 'https://remotion.media/minecraft-hurt.wav',
  ohMyGodVine: 'https://remotion.media/oh-my-god-vine.wav',
  illuminatiConfirmed: 'https://remotion.media/illuminati-confirmed.wav',
  dramaticBoomer: 'https://remotion.media/dramatic-boomer.wav',
  triggered: 'https://remotion.media/triggered.wav',
  recordScratch: 'https://remotion.media/record-scratch.wav',
};

type TransitionSound = {
  enabled: boolean;
  effect: TransitionSoundEffectId;
  volume: number;
};

type SceneTransitionToNext = {
  enabled: boolean;
  presentation: TransitionPresentationType;
  slideDirection: TransitionDirection;
  durationInFrames: number;
  sound?: TransitionSound;
};

type RenderLayer = {
  id: string;
  sort?: number;
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
    trimBeforeFrames: number;
    trimAfterFrames: number | null;
    volume: number;
    playbackRate: number;
  };
  layers: RenderLayer[];
  transitionToNext?: SceneTransitionToNext;
};

export type StoryboardRenderInputProps = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  scenes: StoryboardRenderScene[];
  baseLayers?: RenderLayer[];
};

const BASE_SCENE_TYPE = 'base';

function isBaseSceneRow(row: UserStoryboardSceneRow): boolean {
  return row.type === BASE_SCENE_TYPE;
}

function regularSceneRows(sceneRows: UserStoryboardSceneRow[]): UserStoryboardSceneRow[] {
  return sceneRows
    .filter((row) => !isBaseSceneRow(row))
    .sort((a, b) => {
      const aSort = typeof a.sort === 'number' ? a.sort : 0;
      const bSort = typeof b.sort === 'number' ? b.sort : 0;
      if (aSort !== bSort) return aSort - bSort;
      return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
    });
}

function getBaseSceneRow(
  sceneRows: UserStoryboardSceneRow[]
): UserStoryboardSceneRow | undefined {
  return sceneRows.find((row) => isBaseSceneRow(row));
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function defaultTransitionToNext(): SceneTransitionToNext {
  return {
    enabled: false,
    presentation: 'fade',
    slideDirection: 'from-left',
    durationInFrames: DEFAULT_TRANSITION_DURATION_FRAMES,
  };
}

function presentationUsesDirection(
  presentation: TransitionPresentationType
): 'cardinal' | 'wipe' | false {
  if (presentation === 'slide' || presentation === 'flip') {
    return 'cardinal';
  }
  if (presentation === 'wipe') return 'wipe';
  return false;
}

function normalizePresentation(value: unknown): TransitionPresentationType {
  if (typeof value === 'string' && PRESENTATION_SET.has(value)) {
    return value as TransitionPresentationType;
  }
  return 'fade';
}

function normalizeDirection(
  value: unknown,
  presentation: TransitionPresentationType,
  fallback: TransitionDirection
): TransitionDirection {
  const directionMode = presentationUsesDirection(presentation);
  if (!directionMode) return fallback;
  if (typeof value !== 'string') return fallback;
  if (directionMode === 'wipe' && WIPE_DIRECTIONS.has(value)) {
    return value as WipeDirection;
  }
  if (directionMode === 'cardinal' && CARDINAL_DIRECTIONS.has(value)) {
    return value as CardinalDirection;
  }
  return fallback;
}

function normalizeSound(raw: unknown): TransitionSound | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const volumeRaw = record.volume;
  const volume =
    typeof volumeRaw === 'number' && Number.isFinite(volumeRaw)
      ? Math.min(1, Math.max(0, volumeRaw))
      : 1;

  let effect: TransitionSoundEffectId = DEFAULT_TRANSITION_SOUND_EFFECT;
  if (typeof record.effect === 'string' && TRANSITION_SOUND_EFFECT_IDS.has(record.effect)) {
    effect = record.effect as TransitionSoundEffectId;
  } else if (typeof record.src === 'string') {
    const trimmed = record.src.trim();
    for (const [id, url] of Object.entries(REMOTION_SFX_URL_BY_ID)) {
      if (url === trimmed) {
        effect = id as TransitionSoundEffectId;
        break;
      }
    }
  }

  return {
    enabled: record.enabled === true,
    effect,
    volume,
  };
}

function normalizeTransitionToNext(
  raw: unknown,
  sceneDuration = DEFAULT_SCENE_DURATION_FRAMES,
  nextSceneDuration = DEFAULT_SCENE_DURATION_FRAMES
): SceneTransitionToNext {
  const defaults = defaultTransitionToNext();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }
  const record = raw as Record<string, unknown>;
  const presentation = normalizePresentation(record.presentation);
  const rawDirection = record.slideDirection ?? record.direction;
  const slideDirection = normalizeDirection(rawDirection, presentation, defaults.slideDirection);
  const durationRaw = record.durationInFrames;
  const maxDuration = Math.max(1, Math.min(sceneDuration, nextSceneDuration));
  const durationInFrames =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? Math.min(maxDuration, Math.max(1, Math.round(durationRaw)))
      : Math.min(defaults.durationInFrames, maxDuration);

  const sound = normalizeSound(record.sound);
  const result: SceneTransitionToNext = {
    enabled: record.enabled === true,
    presentation,
    slideDirection,
    durationInFrames,
  };
  if (sound) {
    result.sound = sound;
  }
  return result;
}

function parseTransitionToNext(scene: unknown): SceneTransitionToNext | undefined {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return undefined;
  const raw = (scene as Record<string, unknown>).transitionToNext;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return normalizeTransitionToNext(raw);
}

function isActiveTransition(
  transition: SceneTransitionToNext | undefined
): transition is SceneTransitionToNext {
  return Boolean(transition?.enabled && transition.durationInFrames > 0);
}

function transitionOverlapFrames(
  transition: SceneTransitionToNext | undefined,
  sceneDuration: number,
  nextSceneDuration: number
): number {
  if (!isActiveTransition(transition)) return 0;
  return Math.min(transition.durationInFrames, sceneDuration, nextSceneDuration);
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

function parseSceneBackground(scene: unknown): {
  type: SceneBackgroundType;
  value: string;
  trimBeforeFrames: number;
  trimAfterFrames: number | null;
  volume: number;
  playbackRate: number;
} {
  const defaults = {
    trimBeforeFrames: 0,
    trimAfterFrames: null as number | null,
    volume: 1,
    playbackRate: 1,
  };

  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    return { type: 'video', value: '', ...defaults };
  }
  const background = (scene as Record<string, unknown>).background;
  if (!background || typeof background !== 'object' || Array.isArray(background)) {
    return { type: 'video', value: '', ...defaults };
  }
  const raw = background as Record<string, unknown>;
  const type = raw.type;
  const value = typeof raw.value === 'string' ? raw.value : '';
  const trimBeforeRaw = raw.trimBeforeFrames ?? raw.trimBefore;
  const trimAfterRaw = raw.trimAfterFrames ?? raw.trimAfter;
  const trimBefore =
    typeof trimBeforeRaw === 'number' && Number.isFinite(trimBeforeRaw)
      ? Math.max(0, Math.round(trimBeforeRaw))
      : defaults.trimBeforeFrames;
  let trimAfter: number | null = defaults.trimAfterFrames;
  if (trimAfterRaw === null) {
    trimAfter = null;
  } else if (typeof trimAfterRaw === 'number' && Number.isFinite(trimAfterRaw)) {
    const rounded = Math.max(0, Math.round(trimAfterRaw));
    trimAfter = rounded > trimBefore ? rounded : null;
  }
  const volumeRaw = raw.volume;
  const volume =
    typeof volumeRaw === 'number' && Number.isFinite(volumeRaw)
      ? Math.min(1, Math.max(0, volumeRaw))
      : defaults.volume;
  const playbackRateRaw = raw.playbackRate;
  const playbackRate =
    typeof playbackRateRaw === 'number' && Number.isFinite(playbackRateRaw)
      ? Math.min(4, Math.max(0.25, playbackRateRaw))
      : defaults.playbackRate;
  const playback =
    type === 'video'
      ? { trimBeforeFrames: trimBefore, trimAfterFrames: trimAfter, volume, playbackRate }
      : defaults;

  if (type === 'video' || type === 'image' || type === 'color') {
    return { type, value, ...playback };
  }
  return { type: 'video', value, ...defaults };
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
    ...(typeof layer.sort === 'number' ? { sort: Math.round(layer.sort) } : {}),
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
  return layers
    .filter(isValidLayer)
    .map(sanitizeLayerForRender)
    .sort((a, b) => {
      const aSort = typeof a.sort === 'number' ? a.sort : 0;
      const bSort = typeof b.sort === 'number' ? b.sort : 0;
      return aSort - bSort;
    });
}

function parseSceneRow(
  row: UserStoryboardSceneRow,
  nextSceneDuration?: number
): StoryboardRenderScene {
  const scene = row.scene;
  const sceneDuration = parseSceneDurationInFrames(scene);
  const renderScene: StoryboardRenderScene = {
    durationInFrames: sceneDuration,
    background: parseSceneBackground(scene),
    layers: parseSceneLayers(scene),
  };

  if (nextSceneDuration != null) {
    const rawTransition = parseTransitionToNext(scene);
    if (rawTransition) {
      renderScene.transitionToNext = normalizeTransitionToNext(
        rawTransition,
        sceneDuration,
        nextSceneDuration
      );
    }
  }

  return renderScene;
}

function totalRenderDurationInFrames(sceneRows: UserStoryboardSceneRow[]): number {
  const regularRows = regularSceneRows(sceneRows);
  if (regularRows.length === 0) return DEFAULT_SCENE_DURATION_FRAMES;

  let total = 0;
  for (let i = 0; i < regularRows.length; i++) {
    const sceneDuration = parseSceneDurationInFrames(regularRows[i]?.scene);
    total += sceneDuration;

    if (i < regularRows.length - 1) {
      const nextSceneDuration = parseSceneDurationInFrames(regularRows[i + 1]?.scene);
      const transition = parseTransitionToNext(regularRows[i]?.scene);
      total -= transitionOverlapFrames(transition, sceneDuration, nextSceneDuration);
    }
  }

  return Math.max(1, total);
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
  const regularRows = regularSceneRows(sceneRows);
  if (regularRows.length === 0) {
    throw new AppError('Storyboard has no scenes to render', {
      statusCode: 400,
      code: 'storyboard_no_scenes',
      expose: true,
    });
  }

  const settings = parseStoryboardSettings(storyboard.settings);
  const scenes = regularRows.map((row, index) => {
    const nextSceneDuration =
      index < regularRows.length - 1
        ? parseSceneDurationInFrames(regularRows[index + 1]?.scene)
        : undefined;
    return parseSceneRow(row, nextSceneDuration);
  });
  const durationInFrames = totalRenderDurationInFrames(sceneRows);
  const baseRow = getBaseSceneRow(sceneRows);
  const baseLayers = baseRow ? parseSceneLayers(baseRow.scene) : [];

  return {
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    durationInFrames,
    scenes,
    baseLayers,
  };
}

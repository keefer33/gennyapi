import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
// ffprobe-static has no bundled TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic = require('ffprobe-static') as { path?: string };

/**
 * Reads a value from a nested object using dot-separated paths (e.g. `parameters.duration`).
 * Aligns with the generate UI `getFormValueAtPath` behavior.
 */
const getFormValueAtPath = (values: unknown, path: string): unknown => {
  if (!path) return values;
  if (typeof values !== 'object' || values === null) return undefined;
  const segments = path.split('.');
  let cur: unknown = (values as Record<string, unknown>)[segments[0]!];
  for (let i = 1; i < segments.length; i += 1) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[segments[i]!];
  }
  return cur;
};

/** Pull the expression from `formula` (string or `{"total_price": <expr>}` shape). */
const extractFormulaExpression = (formula: unknown): string | null => {
  if (formula == null) return null;
  if (typeof formula === 'object' && formula !== null) {
    const o = formula as Record<string, unknown>;
    if (typeof o.total_price === 'string') return o.total_price.trim();
    if (typeof o.total_price === 'number' && Number.isFinite(o.total_price)) return String(o.total_price);
  }
  let s = typeof formula === 'string' ? formula.trim() : String(formula).trim();
  if (!s) return null;
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      const once = JSON.parse(s);
      if (typeof once === 'string') return extractFormulaExpression(once);
    } catch {
      /* ignore */
    }
  }
  if (s.startsWith('{')) {
    const colonIdx = s.indexOf(':');
    if (colonIdx < 0) return null;
    const end = s.lastIndexOf('}');
    if (end <= colonIdx) return null;
    return s.slice(colonIdx + 1, end).trim();
  }
  return s;
};

/** Turn DSL `field = "x"` comparisons into JS `===` (not assignment). */
const dslStringComparisonsToJs = (expr: string): string =>
  expr.replace(/\b([a-zA-Z_$][\w$]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '($1 === $2)');

const SAFE_FORMULA_CHARS = /^[0-9a-zA-Z_$.\s?:(,),+\-*"'=!]+$/;

const assertSafePricingFormula = (js: string): void => {
  if (!SAFE_FORMULA_CHARS.test(js)) {
    throw new Error('formula: disallowed characters in expression');
  }
  const withoutTriple = js.split('===').join('');
  if (withoutTriple.includes('=')) {
    throw new Error('formula: bare "=" is not allowed (use === comparisons only)');
  }
  if (/\b(?:eval|function|constructor|prototype|__proto__|import|require)\b/i.test(js)) {
    throw new Error('formula: disallowed keyword in expression');
  }
};

/**
 * Evaluates `pricing.formula` with `formValues` and `pricing.base_price` (injected as `base_price`).
 * Formula DSL allows `field = "value"` for string equality; wrap as `{"total_price": <expr>}` or raw expr.
 */
export const evaluatePricingFormula = (formValues: any, pricing: any): number => {
  const raw = extractFormulaExpression(pricing?.formula);
  if (!raw) return 0;
  let js: string;
  try {
    js = dslStringComparisonsToJs(raw);
    assertSafePricingFormula(js);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[evaluatePricingFormula]', msg);
    return 0;
  }
  const basePrice = Number(pricing?.base_price);
  const base_price = Number.isFinite(basePrice) ? basePrice : 0;
  const safeForm = formValues && typeof formValues === 'object' ? formValues : {};
  const merged: Record<string, unknown> = { ...safeForm, base_price };
  const paramNames = Object.keys(merged).filter(k => /^[a-zA-Z_$][\w$]*$/.test(k));
  const values = paramNames.map(k => merged[k]);
  try {
    const fn = new Function(...paramNames, `"use strict"; return (${js});`);
    const result = fn(...values);
    const n = Number(result);
    return Number.isFinite(n) ? n : 0;
  } catch (e: unknown) {
    console.warn('[evaluatePricingFormula] runtime', e);
    return 0;
  }
};

const mediaSource = (input: unknown): string => {
  if (Array.isArray(input)) return input.length > 0 ? mediaSource(input[0]) : '';
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object') return '';
  const item = input as Record<string, unknown>;
  const source = item.url ?? item.file_url ?? item.file_path ?? item.filePath;
  return typeof source === 'string' ? source.trim() : '';
};

export type FieldRangePricingBand = {
  min: number;
  max: number;
  cost: number;
};

/**
 * Resolves a per-run cost from a numeric form field and inclusive min/max bands.
 * First matching band wins. Returns 0 when the value is missing or falls outside all bands.
 *
 * Example `model_pricing` for upscale `target` (1–128 MP):
 * `{ "type": "fieldRange", "field": "target", "ranges": [
 *   { "min": 1, "max": 4, "cost": 0.005 },
 *   { "min": 5, "max": 8, "cost": 0.01 },
 *   { "min": 9, "max": 16, "cost": 0.02 },
 *   { "min": 17, "max": 32, "cost": 0.04 },
 *   { "min": 33, "max": 64, "cost": 0.06 },
 *   { "min": 65, "max": 128, "cost": 0.12 }
 * ]}`
 */
export const lookupFieldRangeCost = (
  value: unknown,
  ranges: FieldRangePricingBand[] | undefined
): number => {
  const n = value !== undefined && value !== null ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0;
  if (!Array.isArray(ranges) || ranges.length === 0) return 0;

  for (const band of ranges) {
    const min = Number(band?.min);
    const max = Number(band?.max);
    const bandCost = Number(band?.cost);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(bandCost)) continue;
    if (n >= min && n <= max) return bandCost;
  }
  return 0;
};

/** Audio or video: ffprobe reads container `format.duration` (seconds, ceil). */
const getMediaDurationSeconds = async (input: unknown): Promise<number> => {
  const source = mediaSource(input);
  if (!source || !ffprobeStatic.path) return 0;
  try {
    const { stdout } = await execFileAsync(
      ffprobeStatic.path,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source],
      { timeout: 30000 }
    );
    const duration = Number(String(stdout).trim());
    return Number.isFinite(duration) && duration > 0 ? Math.ceil(duration) : 0;
  } catch (error) {
    console.warn('[calculatePricingUtil] ffprobe media duration lookup failed', error);
    return 0;
  }
};

export const calculatePricingUtil = async (formValues: any, pricing: any) => {
  let cost: number = 0;
  const lookupMultiFields = async (config: any, formValuesInput: any): Promise<number> => {
    const safeFormValues = formValuesInput && typeof formValuesInput === 'object' ? formValuesInput : {};
    let current = config;
    let depth = 0;
    const maxDepth = 25;
    const seen = new Set<any>();

    while (current && depth < maxDepth) {
      // Protect against circular references / self-referential config.
      if (typeof current === 'object') {
        if (seen.has(current)) return 0;
        seen.add(current);
      }

      const field = typeof current?.field === 'string' ? current.field : undefined;
      const selectedValue = field ? getFormValueAtPath(safeFormValues, field) : undefined;
      const values = current?.values;
      const branchMap =
        selectedValue !== undefined && values && typeof values === 'object'
          ? (values as Record<string, unknown>)
          : null;
      const keyStr = selectedValue !== undefined ? String(selectedValue) : '';
      const next = branchMap
        ? (branchMap[keyStr] ??
            Object.entries(branchMap).find(
              ([key]) => key.toLowerCase() === keyStr.toLowerCase()
            )?.[1])
        : undefined;
      const data = next ?? current;

      const numeric = Number(data);
      if (Number.isFinite(numeric) && numeric !== 0) {
        return numeric;
      }

      if (data?.type === 'multi') {
        const unitCost = Number(data.cost);
        const multField = typeof data.field === 'string' ? data.field : undefined;
        const multiplier = Number(multField ? getFormValueAtPath(safeFormValues, multField) : NaN);
        if (!Number.isFinite(unitCost) || !Number.isFinite(multiplier)) return 0;
        return unitCost * multiplier;
      }

      if (data?.type === 'multiConvert' || data?.type === 'multiConvertAudio') {
        const unitCost = Number(data.cost);
        if (!Number.isFinite(unitCost)) return 0;
        const convertField = typeof data.field === 'string' ? data.field : undefined;
        const sourceValue = convertField ? getFormValueAtPath(safeFormValues, convertField) : undefined;
        const durationSeconds = await getMediaDurationSeconds(sourceValue);
        return unitCost * durationSeconds;
      }

      if (data && typeof data === 'object' && data.cost !== undefined && !data.type) {
        const leafCost = Number(data.cost);
        return Number.isFinite(leafCost) ? leafCost : 0;
      }

      // No deeper branch available or malformed branch: stop safely.
      if (!data || typeof data !== 'object' || !data.field) {
        return 0;
      }

      current = data;
      depth += 1;
    }

    return 0;
  };

  switch (pricing.type) {
    case 'per':
      cost = pricing.cost;
      break;
    case 'perMulti':
      if (formValues.num_images || formValues.max_images || formValues.n) {
        cost = pricing.cost * (formValues.num_images || formValues.max_images || formValues.n);
      }
      break;
    case 'singleField': {
      const sf =
        typeof pricing.field === 'string'
          ? getFormValueAtPath(formValues, pricing.field)
          : undefined;
      cost = (sf !== undefined && pricing.cost != null ? pricing.cost[sf as keyof typeof pricing.cost] : 0) || 0;
      break;
    }
    case 'singleFieldMultiplier': {
      // cost = price * fieldValue (e.g. price per unit × duration)
      const price = Number(pricing.cost);
      const fieldValue =
        typeof pricing.field === 'string' ? getFormValueAtPath(formValues, pricing.field) : undefined;
      const value = fieldValue !== undefined && fieldValue !== null ? Number(fieldValue) : NaN;
      cost = !Number.isNaN(price) && !Number.isNaN(value) ? price * value : 0;
      break;
    }
    case 'fieldRange': {
      const fieldValue =
        typeof pricing.field === 'string' ? getFormValueAtPath(formValues, pricing.field) : undefined;
      cost = lookupFieldRangeCost(fieldValue, pricing.ranges);
      break;
    }
    case 'multiFields':
      if (pricing.cost) {
        cost = await lookupMultiFields(pricing.cost, formValues);
      }
      break;
    case 'formula':
      cost = evaluatePricingFormula(formValues, pricing);
      break;
    default:
      cost = 0;
  }
  return cost;
};

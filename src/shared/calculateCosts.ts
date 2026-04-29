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

export const calculatePricingUtil = async (formValues: any, pricing: any) => {
  let cost: number = 0;
  const lookupMultiFields = (config: any, formValuesInput: any): number => {
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
      const selectedValue = field ? safeFormValues[field] : undefined;
      const next = selectedValue !== undefined ? current?.values?.[selectedValue] : undefined;
      const data = next ?? current;

      const numeric = Number(data);
      if (Number.isFinite(numeric) && numeric !== 0) {
        return numeric;
      }

      if (data?.type === 'multi') {
        const unitCost = Number(data.cost);
        const multiplier = Number(safeFormValues[data.field]);
        if (!Number.isFinite(unitCost) || !Number.isFinite(multiplier)) return 0;
        return unitCost * multiplier;
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
    case 'singleField':
      cost = pricing.cost[formValues[pricing.field]] || 0;
      break;
    case 'singleFieldMultiplier': {
      // cost = price * fieldValue (e.g. price per unit × duration)
      const price = Number(pricing.cost);
      const fieldValue = formValues[pricing.field];
      const value = fieldValue !== undefined && fieldValue !== null ? Number(fieldValue) : NaN;
      cost = !Number.isNaN(price) && !Number.isNaN(value) ? price * value : 0;
      break;
    }
    case 'multiFields':
      if (pricing.cost) {
        cost = lookupMultiFields(pricing.cost, formValues);
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

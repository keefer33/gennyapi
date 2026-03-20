-- Migrates models_generation_apis.pricing from legacy `tokens` schema to `cost`
-- and converts token values to currency where 1 token = 0.005.
--
-- Example:
--   {"type":"per","tokens":120}
-- becomes
--   {"type":"per","cost":0.6}
--
-- This script only updates rows whose pricing JSON contains a top-level `tokens` key.

BEGIN;

-- Recursively walks a JSONB value:
-- - Renames every object key named `tokens` to `cost`
-- - Multiplies numeric leaves only inside legacy `tokens` subtree by TOKEN_RATE
CREATE OR REPLACE FUNCTION public.convert_pricing_tokens_json(
  j jsonb,
  convert_numbers boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  key text;
  val jsonb;
  next_convert boolean;
  out_obj jsonb := '{}'::jsonb;
  out_arr jsonb := '[]'::jsonb;
  idx integer;
  arr_len integer;
  token_rate numeric := 0.005;
BEGIN
  IF j IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(j)
    WHEN 'number' THEN
      IF convert_numbers THEN
        RETURN to_jsonb(round((j::text)::numeric * token_rate, 6));
      END IF;
      RETURN j;

    WHEN 'object' THEN
      FOR key, val IN SELECT * FROM jsonb_each(j)
      LOOP
        next_convert := convert_numbers OR key = 'tokens';
        out_obj :=
          out_obj ||
          jsonb_build_object(
            CASE WHEN key = 'tokens' THEN 'cost' ELSE key END,
            public.convert_pricing_tokens_json(val, next_convert)
          );
      END LOOP;
      RETURN out_obj;

    WHEN 'array' THEN
      arr_len := jsonb_array_length(j);
      IF arr_len = 0 THEN
        RETURN out_arr;
      END IF;

      FOR idx IN 0..arr_len - 1
      LOOP
        out_arr :=
          out_arr || jsonb_build_array(public.convert_pricing_tokens_json(j -> idx, convert_numbers));
      END LOOP;
      RETURN out_arr;

    ELSE
      -- string, boolean, null
      RETURN j;
  END CASE;
END;
$$;

WITH updated AS (
  UPDATE public.models_generation_apis
  SET pricing = public.convert_pricing_tokens_json(pricing::jsonb, false)::json
  WHERE pricing::jsonb ? 'tokens'
  RETURNING id
)
SELECT COUNT(*) AS updated_rows
FROM updated;

-- Optional post-check:
-- SELECT id, model_name, pricing
-- FROM public.models_generation_apis
-- WHERE pricing::jsonb ? 'tokens'
-- LIMIT 20;

-- Keep helper function for repeatability. Drop it if you prefer:
-- DROP FUNCTION public.convert_pricing_tokens_json(jsonb, boolean);

COMMIT;


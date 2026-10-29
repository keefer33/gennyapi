# Recraft prompting

Recraft is built for **design-grade stills**: icons, brand marks, product shots, illustrations, and vector artwork. Prompts should sound like an art-director brief, not a film shot list.

## Prompt structure

> Flat vector icon of a steaming mug, two-color navy and cream, geometric, centered, generous padding, no text, app-icon ready.

Cover:

1. **Object and use** — icon, logo, poster, product photo, pattern
2. **Medium** — vector vs raster is usually a model choice; still say “flat vector” or “studio photo”
3. **Style constraints** — palette, line weight, corner radius, era
4. **Composition** — centered, grid, isometric, hero product
5. **Text** — exact words, or “no text”

## Do

- Write for a designer: “logo lockup”, “sticker”, “packaging front”, “UI illustration”.
- Limit the palette when you need brand consistency (two or three named colors).
- For icons, demand simplicity: one metaphor, no tiny details, clear silhouette.
- For photoreal product shots, describe surface, studio light, and background sweep.
- For style models, describe the *job* of the image; let the Recraft style id carry the look.

## Don’t

- Don’t write cinematic camera essays for icons (“85mm anamorphic, volumetric fog”).
- Don’t ask a vector model for photographic bokeh, film grain, or noisy texture.
- Don’t put long slogans on a small icon. Recraft lettering is best at short marks.
- Don’t mix “photoreal oil painting watercolor pixel art” in one prompt.

## Vector vs raster

- **Raster** (V4.1 photo / illustration): materials, lighting, and texture are fair game.
- **Vector** (`*_vector` models): think shapes, fills, strokes, and flat color. Ask for clean edges, limited colors, and scalable geometry. Avoid “realistic skin pores” language.
- **Utility / Pro** variants follow the same prompt style; Pro is more faithful to tight brand constraints.

## Style and brand language

If a style id or reference style is selected in the form, don’t fight it in the prompt. Describe content and layout; mention color only if you need to override.

Negative constraints work better here than on Flux: “no text”, “no gradients”, “no drop shadow”, “no photoreal people” are useful for icon sets.

## Parameters that change wording

- **Aspect ratio** — icons want square with padding; posters want title-safe margins. Say where empty space goes.
- **Vector vs raster model** — rewrite the medium clause to match.
- **Style models** — shorter prompts; the style carries rendering.
- **Reference images** — “same mascot, new pose” or “extract a flat icon from this photo”.

If a set of icons must match, reuse the same palette, stroke, and padding language every time.

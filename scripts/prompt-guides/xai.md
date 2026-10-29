# xAI Grok Imagine prompting

xAI playground models are **Grok Imagine**: stills (`grok-imagine-image-2.0`) and short videos (`grok-imagine-video-1.5` and `1.5-lite`). Write a shot or a still, not a keyword dump. Product-specific guides on each model add mode limits (references, voices, edit vs generate).

## Prompt structure

> Medium shot of a courier weaving a night market, steam and paper lanterns, slow handheld follow, warm practicals, crowd murmur and scooter engines.

Cover:

1. **Subject and action** (or pose, for stills)
2. **Place, time, weather**
3. **Camera** — size, height, move
4. **Light and materials**
5. **Sound** on video — diegetic audio and spoken lines you want lip-synced

## Do

- One beat per generation. A 6-second clip is one action, not three locations.
- Name camera path (“slow push-in”, “locked wide”, “whip pan off”).
- Quote on-screen or spoken text exactly.
- For image inputs, prompt **what changes**: motion, camera, weather, edit — not a full restyle unless you want one.

## Don’t

- Don’t encode duration, resolution, or aspect ratio in the prompt; those are form fields.
- Don’t stack conflicting cameras or lights.
- Don’t write a multi-scene screenplay for a short clip.

Use the product guide on the selected model for references, voices, last frames, and image edit vs generate.

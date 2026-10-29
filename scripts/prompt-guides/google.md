# Google prompting (Veo, Gemini image)

Google’s playground models (Veo video, Gemini/Nano Banana image) follow a **cinematic brief**: subject, action, camera, lighting, and optional audio. Write complete shots, not tag soup.

## Prompt structure

Treat each prompt as one shot or one still.

> Medium shot of a baker sliding a tray of croissants from a deck oven, warm tungsten practicals, flour in the air, slow push-in, quiet kitchen ambience.

Include:

1. **Shot size and subject** — close-up, medium, wide; who/what
2. **Action** — what happens during the clip (video) or the pose (image)
3. **Camera** — move, lens feel, and whether the camera is locked or handheld
4. **Light and color** — time of day, motivated sources, palette
5. **Audio (video)** — diegetic sound if the model generates audio

## Do

- Use film language: pan, tilt, dolly, tracking, rack focus, smash cut only if you mean a cut.
- Keep camera motion physically possible. One primary move per shot.
- Describe materials and weather; Google models use them for atmosphere.
- For people, give wardrobe, age range, and expression rather than celebrity lookalikes.
- When using reference images (i2v / image edit), say *how* the reference is used: identity lock, first frame, style, wardrobe.

## Don’t

- Don’t over-specify conflicting moves (“slow drone pullback while crash zooming”).
- Don’t write a whole scene with dialogue and three locations in one short clip. One beat per generation.
- Don’t dump lighting presets plus “cinematic 8k masterpiece”. Pick a real lighting setup.
- Don’t encode duration, aspect ratio, or resolution in the prompt if they are already form fields.

## Image models

Gemini image / Nano Banana variants: composition and subject first. For text-in-image, put the exact copy in quotes. For edits, say what to change and what to preserve (“keep the same face and outfit, replace the background with a rainy street”).

## Video models (Veo)

- Start from a still or a text shot, then add **time**: “over four seconds she looks up as headlights pass”.
- First-frame / last-frame workflows: prompt the motion between frames, not a new story.
- Audio cues should match the picture (footsteps on wood, distant traffic). Avoid scoring language unless you want music in the clip.

## Parameters that change wording

- **Aspect ratio** — compose a vertical phone story vs a widescreen establishing shot.
- **Duration** — fewer actions for shorter clips.
- **Reference images** — identity vs style vs start frame; state which.
- **Image-only vs video** — stills need pose and light; video needs action and camera path.

For **Lyria** full-song music, use the Lyria model guide. This brand guide is for picture, not music composition.

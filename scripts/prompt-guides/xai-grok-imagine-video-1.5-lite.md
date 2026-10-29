# Grok Imagine Video 1.5 Lite prompting

`grok-imagine-video-1.5-lite` is the cheap Imagine video model: **text-to-video** and **image-to-video** only, 1–15 seconds, with lip-synced speech. 1080p is an upscale from 720p. Use this for simple clips; switch to 1.5 when you need references, voices, or a last frame.

## Prompt structure

> Wide shot of a skateboarder rolling through an empty parking garage, late sun stripes on concrete, slow tracking from the side, wheel rumble and distant traffic.

1. **Shot size and subject**
2. **One action**
3. **Camera**
4. **Light**
5. **Sound / spoken line** if you want lip-sync

## Do

- Keep the shot simple. Lite is built for everyday clips, not multi-asset control.
- Quote any spoken line. Audio is generated and lip-synced.
- For image-to-video, prompt **what happens next**. The still is the first frame and sets aspect ratio.
- Prefer 720p for the native look; pick 1080p only when you need the extra scale.

## Don’t

- Don’t send reference images, voice picks, or a last frame — Lite does not support them. Use **Grok Imagine Video 1.5** for those.
- Don’t write a two-location story into a 5-second prompt.
- Don’t describe a native 1080p plate; 1080p here is upscaled.

## Modes

- **Text-to-video** — pick aspect ratio (16:9, 9:16, 1:1, …).
- **Image-to-video** — required still; aspect ratio follows the image.

## Parameters that change wording

- **Duration** — one beat for short clips.
- **Resolution** — 480p cheapest, 720p the honest default, 1080p upscaled and more expensive.
- **Aspect ratio** (text-to-video) — compose a vertical phone story vs a widescreen establishing shot.

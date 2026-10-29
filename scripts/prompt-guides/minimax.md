# MiniMax H3 prompting

MiniMax H3 (quality, Highspeed, Lite, and Max) is a **multimodal video** model. Write a shot, not a keyword dump: subject, action, camera, light, and optional sound. Prompt length can be long (up to 7000 characters) — use that for story beats, not filler.

## Prompt structure

> Medium shot of a baker sliding croissants from a deck oven, flour in the air, slow push-in, warm tungsten practicals, quiet kitchen ambience.

Cover:

1. **Shot size and subject**
2. **Action in time** — what happens during the clip
3. **Camera** — locked, handheld, pan, tilt, dolly, zoom, or `[static]` / `[pan]` / `[zoom]` after a beat
4. **Light, materials, weather**
5. **Sound** if you care about diegetic audio (footsteps, crowd, voice)

## Do

- One beat per generation. A 5-second clip is one action, not three locations.
- Name camera height and path (“hip-height tracking”, “slow boom up”).
- For image-to-video, prompt **what changes** from the still: motion, camera, weather — not a full restyle unless you want one.
- For first + last frame, prompt the **transition** between those two pictures.
- For reference-to-video, say how each asset is used: “appearance follows image 1”, “motion follows video 1”, “voice follows audio 1”.
- Keep on-screen text short and quote the exact copy.

## Don’t

- Don’t mix first/last-frame image-to-video with reference images/videos/audio in one run. Those modes are exclusive.
- Don’t write a multi-scene screenplay for a short duration.
- Don’t stack conflicting cameras (“macro crash zoom while aerial pullback”).
- Don’t encode duration or resolution in the prompt; those are form fields.
- Don’t send last-frame without a first-frame image.

## Modes

- **Text-to-video** — pick a concrete aspect ratio (16:9, 9:16, …). Adaptive is not allowed.
- **Image-to-video** — first frame required; last frame optional. Aspect ratio follows the still (`adaptive`).
- **Reference-to-video** — up to 9 images, 3 videos, 3 audio clips. Describe identity vs motion vs voice. Quality/Highspeed/Max may use adaptive; **Lite** needs a concrete ratio (no adaptive).

## Which variant

- **H3 (quality)** — 768P or 2K, 4–15s. Best look; slowest/most expensive.
- **H3 Highspeed** — 768P only, 4–15s. Same prompting, faster everyday output.
- **H3 Lite** — 480P or 768P, 4–15s. Cheapest; keep prompts simple. Text-to-video and reference-to-video need an explicit ratio.
- **H3 Max** — 480P or 768P, 5–15s. Optional prompt expansion (disabled / balanced / quality). Expansion rewrites the prompt; turn it off if you need exact wording.

## Parameters that change wording

- **Duration** — fewer actions for shorter clips.
- **Aspect ratio** — compose a vertical phone story vs a widescreen establishing shot.
- **References** — state which file is identity, motion, or voice; don’t assume the model will guess.
- **Last frame** — describe the landing pose, not a new scene.

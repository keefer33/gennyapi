# Flux prompting

Flux (Black Forest Labs) models respond best to a clear, photographic brief: **subject, setting, lighting, camera**. Write like a cinematographer, not a keyword dump.

## Prompt structure

Lead with the subject and action, then place, then light, then lens/camera, then mood.

Example:

> A red-haired woman in a wool coat crossing a rain-wet Tokyo crosswalk at night, neon signs reflecting on the pavement, shallow depth of field, 35mm, cinematic color grade.

Order that works well:

1. **Who / what** — the subject and what they are doing
2. **Where** — environment, time of day, weather
3. **How it is lit** — key light, bounce, practicals, color temperature
4. **How it is shot** — lens, camera height, depth of field, motion
5. **Finish** — film stock, grade, texture (only if it matters)

## Do

- Use natural language sentences. Flux parses prose better than comma-separated tags.
- Name materials and surfaces (wet asphalt, brushed aluminum, worn denim).
- Specify camera language when you care about look: 85mm portrait, wide 24mm, overhead, handheld, locked-off.
- For photoreal work, describe light more than “style”: overcast skylight, hard noon sun, tungsten practicals, rim light.
- For stylized work, name the medium once (oil painting, risograph, 2D animation background) and then describe the scene.
- Keep one visual idea per prompt. Extra plots compete.

## Don’t

- Don’t stack conflicting cameras or lighting (“macro close-up, aerial wide, studio softbox, moonlight”).
- Don’t rely on negative prompts as the main control. Say what you want in frame instead of listing everything to avoid.
- Don’t over-specify anatomy (“perfect hands, 8k, ultra detailed”) — it rarely helps and can look synthetic.
- Don’t paste long artist-name lists. One clear aesthetic is stronger than twenty references.

## Image vs video

**Image models** (FLUX.2 / FLUX.1 family): composition, lens, and lighting carry the frame. Reference images, when the schema allows them, should be described in the prompt as how to use them (identity, pose, style), not as a URL.

**FLUX 3 video**: add motion. Name camera move and subject action in time (“slow dolly in as she turns toward camera”, “static wide while traffic streams past”). Duration, resolution, and audio are form parameters — don’t encode them as prompt poetry.

### Draft vs Draft Enhance

- **Draft on**: cheaper HD preview plus a hidden cache. Prompt as you would a full render; keep motion simple so the later enhance has a clean base.
- **Draft Enhance**: pick the draft **video** (not a `.bin`). Enhance has no prompt — it upscales the cached draft. Do not rewrite the shot here; generate a new draft if the composition is wrong.

## Parameters that change wording

- **Aspect ratio** — compose for it in the prompt (vertical portrait vs wide establishing shot).
- **Image-to-video / keyframes** — describe how the still becomes motion; don’t re-describe the whole photo.
- **Video-to-video / continuation** — prompt the *next* action, not a new scene unless you want a cut.
- **generate_audio** — mention diegetic sound only if audio is on (rain, crowd, footsteps).

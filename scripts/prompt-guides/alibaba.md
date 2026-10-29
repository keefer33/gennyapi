# Alibaba prompting (Wan video)

Wan models (Alibaba) are **motion-first video** generators. The prompt should read as a shot list: subject action, camera path, and pacing. Stills without motion language tend to look like slightly animated photographs.

## Prompt structure

> Wide shot of a courier on a motorbike weaving through night market stalls, camera tracking alongside at hip height, steam and lantern light, 8 seconds of continuous motion.

Cover:

1. **Subject and verb** — who moves, what they do
2. **Camera** — locked, handheld follow, orbit, crane, POV
3. **Environment in motion** — crowd flow, weather, vehicles, cloth
4. **Pacing** — slow, urgent, one continuous take vs implied cut

## Do

- Put the strongest motion in the first clause. Wan weights early action words.
- Name camera height and path (“low tracking shot”, “slow boom up”, “static wide”).
- Describe secondary motion (hair, rain, traffic) so the clip doesn’t freeze behind a moving subject.
- For image-to-video, describe **what changes** from the still: “the woman turns her head; lanterns sway; camera eases in”.
- For first/last frame, prompt the transition, not two unrelated scenes.

## Don’t

- Don’t write a multi-scene narrative for a 5-second clip.
- Don’t mix impossible cameras (“macro of an eye while aerial city flyover”).
- Don’t lean on “cinematic, 4k, highly detailed” instead of blocking.
- Don’t restate duration and resolution in the prompt; those are form fields.

## Shot language that helps

- **Locked-off** — environment and subject move; good for time-lapse feel or dialogue-like stillness
- **Tracking / follow** — subject travels through space
- **Orbit / arc** — reveal the environment around a mostly still subject
- **Push-in / pull-out** — emotional emphasis; keep it slow unless you want a jolt

## Parameters that change wording

- **Duration** — one action for short clips; a small beat change only if duration is long enough.
- **Resolution** — does not change prompt style; keep language concrete either way.
- **Image-to-video** — preserve identity from the still; prompt motion and camera only.
- **Text-to-video** — you must also describe appearance, wardrobe, and lighting because there is no still.

If the result is too static, add a camera verb and one environmental motion. If it is chaotic, remove extra subjects and keep a single path.

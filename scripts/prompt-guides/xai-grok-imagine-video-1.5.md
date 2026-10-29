# Grok Imagine Video 1.5 prompting

`grok-imagine-video-1.5` is the full Imagine video model: **text-to-video**, **image-to-video**, and **reference-to-video**, with native 1080p, lip-synced speech, optional last frame, and preset voices. Clips are 1–15 seconds.

## Prompt structure

> Close-up of a baker sliding croissants from a deck oven, flour in the air, slow push-in, warm tungsten, quiet kitchen, she says “fresh batch.”

1. **Shot size and subject**
2. **Action in time**
3. **Camera path**
4. **Light / materials**
5. **Sound and dialogue** — native audio; spoken lines are lip-synced

## Do

- One action per clip. Shorter durations need fewer beats.
- Describe diegetic sound (footsteps, rain, crowd). Write spoken lines in quotes if a character talks.
- For image-to-video, the still **is** the first frame. Prompt motion and camera from that picture; aspect ratio follows the still.
- For a last frame, prompt the **landing** pose, not a new scene. The same image as first and last makes a loop.
- For reference-to-video, say how each still is used: “appearance follows image 1”, “location follows image 2”.
- If you pick a voice, write dialogue that fits that character; don’t fight the voice with a conflicting description.

## Don’t

- Don’t mix a first-frame still with a pile of unrelated references unless you mean it. First frame pins the open; references supply identity and world.
- Don’t ask for mid-clip cuts, titles, or a trailer with three locations.
- Don’t put duration or resolution in the prose.
- Don’t expect reference-to-video at 1080p to behave like a still-lock; keep identity language in the prompt.

## Modes

- **Text-to-video** — pick aspect ratio. The model invents a first frame from the prompt, then animates it.
- **Image-to-video** — required still becomes frame 1. Optional last frame. No aspect-ratio field (it follows the image).
- **Reference-to-video** — up to seven reference images in this playground, optional last frame, optional one or two preset voices. Describe identity vs motion vs voice.

## Parameters that change wording

- **Duration** — fewer actions for 2–4s; a 12–15s clip can hold a small camera move plus one line of speech.
- **Resolution** — 480p / 720p / native 1080p. Prompt the same; 1080p is the quality pick.
- **Voices** — name who speaks only if it matches the selected voice.
- **Last frame** — describe the end state (“holds the look at camera”) rather than a new location.

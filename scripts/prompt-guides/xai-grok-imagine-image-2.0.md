# Grok Imagine Image 2.0 prompting

`grok-imagine-image-2.0` is xAI’s stills model: **text-to-image**, **edit**, and **reference-to-image**. Write an art-director brief. Quality (`low` / `medium`) and resolution (`1k` / `2k`) are form fields — don’t bake them into the prose.

## Prompt structure

> Studio product photo of a matte black headphone on brushed aluminum, 3/4 view, softbox key from camera left, deep charcoal sweep, no logo text.

1. **Subject and use** — photo, poster, product, illustration
2. **Composition and crop**
3. **Medium / style** — once
4. **Light and materials**
5. **On-image text** — exact copy in quotes, or “no text”

## Do

- Natural-language sentences. Name surfaces and light.
- For posters and UI, put the exact words in quotes and say where they sit.
- For edits, lead with the change and what must stay (“keep the same face and wardrobe, swap the background for a rainy street”).
- For multiple references, say the job of each: “identity from image 1, wardrobe from image 2, style from image 3”.

## Don’t

- Don’t stack five styles (“oil painting watercolor pixel art cinematic 8k”).
- Don’t ask for a long readable paragraph on a small graphic. Short labels work.
- Don’t restate resolution or quality in the prompt.
- Don’t treat edit as a new generate: if you ignore the source, you will still be billed for the input image.

## Modes

- **Text-to-image** — prompt is the whole brief. Pick aspect ratio.
- **Edit** — one source image plus an instruction. Describe the delta.
- **Reference-to-image** — up to five stills. Say identity vs style vs layout. Aspect ratio can be `auto`.

## Parameters that change wording

- **Aspect ratio** — compose for vertical phone vs square product vs wide hero.
- **Quality** — same prompt; medium is the default look.
- **n** — identical brief, several rolls; don’t ask the prompt for “four variations”.
- **References** — state which file is identity, product, or style.

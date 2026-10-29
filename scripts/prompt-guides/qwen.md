# Qwen prompting (Qwen Image)

Qwen Image models are strong at **structured scenes, bilingual text, and text rendered in the picture**. English, Chinese, or mixed prompts all work. Be explicit about layout and any words that must appear.

## Prompt structure

> Overhead product shot of a ceramic teapot on dark walnut, soft window light from the left, steam rising, small card in the foreground with the words “春茶” in clean calligraphy.

Include:

1. **Subject and composition** — placement, camera angle, crop
2. **Style / medium** — photo, illustration, poster, UI mock, ink
3. **Lighting**
4. **Text in image** — exact string in quotes, language, and where it sits
5. **Edit intent** (edit models) — what stays vs what changes

## Do

- Put on-image text in quotes and name the language: `"OPEN"` in bold English sans-serif on the storefront.
- For Chinese copy, write the characters you want; don’t ask the model to “translate into a sign” without the string.
- Describe spatial layout (“title at top third, subject centered, small caption bottom-left”).
- For photoreal, specify lens and light the same way you would for a catalog shot.
- For illustration, name the medium and line weight once, then describe the scene.

## Don’t

- Don’t ask for long paragraphs of readable body text. Short labels, titles, and logos work; essays don’t.
- Don’t mix two layouts (“poster and cinematic widescreen close-up”) in one prompt.
- Don’t use vague “add some Chinese aesthetic” — name motifs, palette, or period.
- Don’t hide the edit: say “keep the same person and pose, change only the background”.

## Generate vs edit

**Text-to-image**: the prompt is the whole brief — appearance, setting, text, style.

**Edit / image-to-image**: lead with the change. Preserve identity and composition unless you want a restyle. Call out text that must remain vs text to replace.

## Bilingual prompts

Mixing English structure with Chinese nouns often works well for East-Asian settings (`a rainy Shanghai alley, 霓虹灯 reflecting on wet stone`). Keep grammar in one language if the model starts mixing scripts on signs you didn’t ask for.

## Parameters that change wording

- **Aspect ratio** — posters and phone wallpapers need different title placement; mention it.
- **Reference / input image** — “match this product, new lifestyle scene” vs “inpaint the sky only”.
- **Style strength** (if present) — weaker strength: describe the delta; stronger: describe the full target look.

When text in the image is wrong, shorten the string, specify font personality (hand lettering vs geometric sans), and place it on a clean surface (sign, label, screen) rather than in mid-air.

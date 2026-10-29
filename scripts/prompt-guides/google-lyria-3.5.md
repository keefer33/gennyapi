# Lyria 3.5 prompting (full song)

Lyria 3.5 generates a **complete song**, not a video clip or a realtime jam. The Google brand guide (Veo / image) does not apply. Write like a producer: genre, mood, arrangement, and optional lyrics.

## Prompt structure

> Upbeat indie-pop song, bright acoustic guitar and handclaps, female vocal, summer-road-trip energy, verse-chorus, around three minutes.

Include:

1. **Genre and era**
2. **Mood / use** — trailer, lullaby, workout, sad ballad
3. **Instrumentation and vocal**
4. **Structure hints** — intro, verse, chorus, bridge (keep it simple)
5. **Lyrics** — paste them in the lyrics field when you care about words; otherwise describe the theme

## Do

- Put musical style in the **prompt** and sung words in **lyrics**.
- For instrumental tracks, set instrumental and describe arrangement, not a singer.
- Name vocal character (intimate close-mic, choir, rap verse, no vocal).
- Reference images (up to 10) can suggest mood, setting, or album art — say “match this mood”, not “describe the photo as a music video”.
- Keep duration as a hint in the form; the prompt can say “short jingle” vs “full radio edit”.

## Don’t

- Don’t write a Veo shot list (“dolly in on a singer on a rooftop”). Lyria is audio.
- Don’t paste a full screenplay. A song theme plus a few lyric lines is enough if you are not supplying complete lyrics.
- Don’t request stems, MIDI, or realtime performance — this endpoint returns one full mix (MP3/WAV).
- Don’t fight instrumental vs lyrics: if instrumental is on, skip lyrics.

## Lyrics vs instrumental

- **With lyrics**: prompt = production; lyrics = words to sing. Simple rhyme and clear chorus work better than dense poetry.
- **Instrumental**: prompt = ensemble, tempo feel, and arc (“builds to a brass hit, then sparse piano outro”).
- If lyrics and prompt disagree (prompt says ballad, lyrics are a novelty rap), the lyrics usually win the vocal; keep them aligned.

## Parameters that change wording

- **instrumental** — drop vocal language entirely.
- **lyrics** — don’t duplicate the full lyric block in the prompt.
- **duration** — jingles vs album-length; don’t demand an exact second count in prose.
- **images** — visual mood only; they will not be “shown” in the audio.

Output is one finished song file. Ask for a new generation if the arrangement is wrong; there is no clip-extend or realtime control in this playground model.

# SanDai design

SanDai (Arabic: سندي) is DarSak's assistant: an original pixel "pocket notebook" companion (teal cover face, pencil antenna, orange bookmark tail) that floats at the screen edge and reflects real assistant state. See [../../ASSISTANT.md](../../ASSISTANT.md) for behaviour and configuration.

## Contents

| Path | What it is |
| --- | --- |
| `previews/sandai-moods.png` / `.svg` | The six moods (idle, thinking, needs you, done, oops, sleeping), generated from the production sprite data in `src/components/sandak/sprite.ts`. |
| `source/Main.dc.html` | Character sheet and playground (switch moods and languages). |
| `source/Pet.dc.html` | The pet sprite as a design component. |
| `source/StudentDesktop.dc.html` | Student home with SanDai docked (EN, desktop). |
| `source/StudentMobileAr.dc.html` | Student home on mobile (AR, RTL). |
| `source/TeacherSchedule.dc.html` | UI plan for the compact teacher schedule and Saturday-start week. |
| `source/canvas.json` | Canvas layout for the boards above. |

The `.dc.html` files are the original Claude Design canvas sources. They load a design-runtime script (`support.js`) that is not part of this repository, so open them in Claude Design rather than directly in a browser.

## Real screenshots

Captured from the staging app (EN/AR, desktop/mobile): `docs/screenshots/staging/sandak-*.webp`
(chat unavailable, group-template draft, guidance drawer, public drawer, draft unavailable).

## Notes

- The visible name is SanDai (English) and سندي (Arabic). Code identifiers, file names and routes still use `sandak` and are unchanged.
- Regenerate the mood sheet with a small script that reads `spriteRects` for each mood in `SANDAK_MOODS` and writes an SVG; the sprite is pure data, so no browser is needed to produce the SVG.
- The sprite and its animation respect `prefers-reduced-motion`.

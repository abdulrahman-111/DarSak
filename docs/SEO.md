# Public entity metadata

Public teacher and group pages provide localized canonical/hreflang metadata, `Person`/`Course` JSON-LD, and entity share images. These use explicit projections through a cookie-less public Supabase client. They never use session-aware contact data, signed profile assets, enrollment information or private workspace records. Unsupported prices, ratings and teaching-language claims are omitted.

Public eligibility controls whether structured data and share images exist; it does not introduce a new gate on the existing page's owner/member or error flows. The public reads are memoized per request. Group follow-up reads start after the existing group eligibility check without waiting for SEO work. Missing images return 404; unavailable upstream data returns 503 with `no-store`.

JSON-LD escapes script delimiters and Unicode separators. The localized not-found boundary preserves the locale layout and provides one home action. A streamed missing page can legitimately have HTTP 200, so tests verify its missing-page content, `noindex` and lack of entity structured data rather than changing access behavior to force a status.

## Share-card fonts

The renderer uses bundled IBM Plex Sans Arabic and Instrument Sans fonts. The static Instrument Sans 700 TTF was converted from the existing licensed Latin WOFF2; its existing SIL Open Font License remains in `src/app/fonts/LICENSE-instrument-sans.txt`. No application dependency or remote font service is required.

`share-glyph-coverage.json` contains the sorted union of the two bundled TTFs' best-cmap codepoints. Regenerate it when either font changes. The Latin conversion uses FontTools' `instantiateVariableFont` at `wght=700`, with `flavor=None` and timestamp recalculation disabled; WOFF2 decoding requires the optional Brotli build tool. These tools are needed only to regenerate the committed assets, not for ordinary application builds.

Unsupported card text falls back to a fixed localized label; profile text and JSON-LD stay intact. Bounded phrases use nonbreaking spaces to keep Arabic word ordering within one shaping run, since this renderer does not apply CSS direction to text ordering. Tests render actual PNGs for Arabic, Latin, mixed text and unsupported glyphs while rejecting external HTTP requests.

## Verification limits

Unit and production-build browser coverage checks public projections, script escaping, locale/UUID handling, real metadata URLs and PNG dimensions, missing entities, localized recovery and read concurrency. Google rich-results eligibility, external messaging previews and field latency are separate checks; these tests do not claim those outcomes or completion of the entire SEO roadmap issue.

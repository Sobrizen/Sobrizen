# Community filters and optional images — 2026-10-28

The community supports combining the existing type and text filters with one emotion and one abstinence-duration band. Duration sorting is ascending, descending or newest first, with undisclosed duration last. Restrictions are applied in PostgREST before 20-row pagination. Legacy messages keep null metadata and remain visible in the unfiltered feed.

New messages automatically take the duration of the **current effective stop at publication** from the canonical private tracking calculation (`healthJourney`). There is no manual duration field. A compact badge immediately follows the username, and the composer previews the value before explicit sharing confirmation. This also applies to copies opened from the journal. Emotion remains optional.

Only the number of days and its provenance (`tracking`) are saved with the message. No stop timestamp, consumption history, quantity, journal data or health assessment is copied. A confirmed stop hour uses complete 24-hour periods; an unknown hour uses calendar days, explained in the composer. A recent active stop can legitimately show “< 1 j”. Missing consent, an unavailable timeline or no current stop gives no badge and does not prevent posting. The duration is refreshed before the initial write, including after an image upload, and uncertain-write retries preserve the original payload.

The app bridge also requires the latest private-load generation to have completed, so a refresh or failed refresh cannot combine an older timeline with temporarily cleared daily check-ins.

Editing an existing message preserves its publication-time duration. Old declared values remain unchanged and are identified as declared in the badge’s accessible description; they are never backfilled from private tracking. The badge describes a user’s tracking entry, not a medical verification. The additive migration `db/community-tracking-badges.sql` records provenance without changing owner access rules.

One optional JPEG, PNG or WebP source image (10 MiB maximum) is decoded and resized locally to a maximum 1600-pixel side, then re-encoded as JPEG (2 MiB maximum). This does not upload the original filename or EXIF/GPS metadata. The private community-images bucket has owner-only insert/delete and member reads for images linked to a post. Images use 10-minute signed URLs; anyone holding an already-issued URL can use it until it expires. No user images are service-worker cached. Existing report and hide-author actions remain available. Moderation remains manual.

Removal/replacement attempts safe Storage API cleanup after the message write. Failed or unconfirmed cleanup is reported. Uncertain network writes are read back to avoid claiming a failed save or deleting a possibly referenced image. Unconfirmed uploads can remain private orphans and need operational reconciliation; there is no new scheduled cleanup service.

An uncommitted edit can retry its frozen payload only while the stored message still matches the original. Updates compare `updated_at`, including a null original value, and report a conflict if another version was saved or the message was deleted. Confirmed committed writes are not repeated.

## Integration and development

Run `node scripts/integrate-community.mjs` before serving the static app. Vercel runs this via vercel.json. The idempotent script inserts a native context bridge into app.mjs before initGames, replaces only the community functions and post-delete action, and resets module state with the existing session invalidation. It also updates the service-worker asset list/version. It does not change authentication, billing, private health tracking, or games. Source-anchor checks fail the build on incompatible upstream changes. The generated app and worker receive Node syntax checks.

The SQL in db/community-filters-and-images.sql records the already-applied named Supabase migration; it is not automatically executed by the build.

## Verification

Seven Node test groups cover duration boundaries, combined restrictions, null sorting, input validation, server query ordering, image paths/signatures and idempotent integration. Chromium tests in an isolated local harness at 390×844 covered filter/reset, optional-image preview, create/edit/remove-image/delete, escaping, image conversion, and keeping the draft after a simulated backend failure. The authenticated request path used a mock backend; no real member account or publication was used for an end-to-end upload test. These harness checks are not a substitute for a production account acceptance test.

The automatic-badge update adds `tests/community-tracking.test.mjs` (canonical stop, retrospective corrections, precise/day-only clocks, zero days, gating and private-data projection), `tests/community-duration-ui.test.mjs` (compact accessible badges and legacy provenance) and `tests/community-duration-dom.test.mjs` (readonly preview, forged fields ignored, refresh at publication, journal copies, preserved edits and uncertain-write retries). Existing journal-sharing DOM tests also verify the removed manual field.

`tests/community-tracking-load.test.mjs` uses the real application and deployment bridge with a simulated service to verify complete loading generations, failures, overlapping refreshes, session invalidation, withdrawn consent and demo behavior.

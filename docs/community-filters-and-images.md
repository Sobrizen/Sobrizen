# Community filters and optional images — 2026-10-28

The community supports combining the existing type and text filters with one emotion and one abstinence-duration band. Duration sorting is ascending, descending or newest first, with undisclosed duration last. Restrictions are applied in PostgREST before 20-row pagination. Legacy messages keep null metadata and remain visible in the unfiltered feed.

Duration means consecutive days explicitly declared by the author **at publication**, not a live profile metric. No private timeline, journal, health assessment or old post is backfilled. The composer requires confirmation for the chosen public-to-members content. Emotion and duration can both be omitted or removed by editing.

One optional JPEG, PNG or WebP source image (10 MiB maximum) is decoded and resized locally to a maximum 1600-pixel side, then re-encoded as JPEG (2 MiB maximum). This does not upload the original filename or EXIF/GPS metadata. The private community-images bucket has owner-only insert/delete and member reads for images linked to a post. Images use 10-minute signed URLs; anyone holding an already-issued URL can use it until it expires. No user images are service-worker cached. Existing report and hide-author actions remain available. Moderation remains manual.

Removal/replacement attempts safe Storage API cleanup after the message write. Failed or unconfirmed cleanup is reported. Uncertain network writes are read back to avoid claiming a failed save or deleting a possibly referenced image. Unconfirmed uploads can remain private orphans and need operational reconciliation; there is no new scheduled cleanup service.

## Integration and development

Run `node scripts/integrate-community.mjs` before serving the static app. Vercel runs this via vercel.json. The idempotent script inserts a native context bridge into app.mjs before initGames, replaces only the community functions and post-delete action, and resets module state with the existing session invalidation. It also updates the service-worker asset list/version. It does not change authentication, billing, private health tracking, or games. Source-anchor checks fail the build on incompatible upstream changes. The generated app and worker receive Node syntax checks.

The SQL in db/community-filters-and-images.sql records the already-applied named Supabase migration; it is not automatically executed by the build.

## Verification

Seven Node test groups cover duration boundaries, combined restrictions, null sorting, input validation, server query ordering, image paths/signatures and idempotent integration. Chromium tests in an isolated local harness at 390×844 covered filter/reset, optional-image preview, create/edit/remove-image/delete, escaping, image conversion, and keeping the draft after a simulated backend failure. The authenticated request path used a mock backend; no real member account or publication was used for an end-to-end upload test. These harness checks are not a substitute for a production account acceptance test.

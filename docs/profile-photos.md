# Optional member-visible profile photos

The profile editor now offers a separate photo control without changing unsaved profile text. A local circular preview appears before the explicit save. Removal is also previewed, then saved. With no image or a read error, the existing initial remains visible. Header, community posts and comments use the current profile photo; unlike abstinence badges, this is not a historical snapshot.

Accepted source files: JPEG, PNG and WebP, at most 10 MiB and 40 megapixels. The browser centers a square crop, resizes to at most 512 × 512 and creates a new JPEG under 512 KiB. Original filenames and EXIF/GPS metadata are not uploaded. Errors remain in the editor with actionable French messages, and the draft remains available for retry. Choosing a new photo does not transmit it until save.

## Access and storage

`profiles.avatar_path` contains only owner UUID/immutable UUID.jpg. Existing external `avatar_url` values are not rendered. The `profile-avatars` bucket is private. Only the owner can upload; authenticated members can download the current referenced profile image, and only the owner can download unlinked uploads. Deletion requires ownership and an unreferenced path. Existing profile and journal policies are not broadened.

Images are downloaded using the authenticated Storage API into in-memory Blob URLs. No public or signed URLs are issued, and no personal images are included in the service worker. Logging out clears these local URLs. A removed image may still exist in a member's already-open page or saved copy; withdrawal cannot undo those copies.

Each replacement uses a new immutable filename, with an owner-scoped compare-and-set on the old profile path. Lost responses are reconciled by checking the stored bytes or the profile reference. Retries preserve the same upload path; concurrent changes are not overwritten. Cleanup uses the Storage API only after confirming no profile references the old file. An interrupted session can leave an owner-only unreferenced upload; account erasure procedures must include this bucket. No automated orphan cleanup is claimed.

Demo images stay in memory and never access the backend. Profile photos are optional and independent of health-data consent.

## Build and verification

Use `npm run build` for the production artifact; Vercel runs `npm run release:check` to test before building. The canonical build applies the community and profile-photo bridges in memory, checks their anchors and validates the result before publishing `dist/`, without rewriting source files. The bridge adds the photo field to profile joins, renders the profile control and avatars, resets state on session invalidation, and includes only static photo modules/styles in the service worker. The historical standalone integration CLIs rewrite sources and are not part of the recommended release process.

`node --test tests/profile-photos.test.mjs` covers validation, path ownership, unchanged profile text, explicit saves, upload rejection, lost responses, replay, concurrent updates, removal, session changes and build transformations. Browser tests use a synthetic local account and real JPEG/PNG decoding against a simulated backend, not member data.

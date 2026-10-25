# Profile, settings and messaging follow-up

25 October 2026, Africa/Harare. Based on platform release `ebe9138`.

## Changes

- Settings now has focused Overview, Profile details, Connections, Messages & notifications, Appearance, Security and Data & help sections. Existing controls remain available. Section switches keep mounted forms and their draft values. Academic-email and temporary-availability details expand on request.
- Profile editing has About you, Photos, Interests and Icebreakers sections, a compact save/discard area and a desktop preview. Drafts survive section switches; existing leave/partial-save protections remain.
- Icebreakers show only the selected questions, with a searchable full catalogue, change/remove actions, labelled answers and character counts. Up to three questions can be selected; existing answers beyond the former first-six-question limit remain editable. Wide layouts place answer cards side by side.
- The photo editor previews a square crop and avatar circle, drag/slider positioning, zoom, quarter-turn rotation, flip, brightness and six filters. Filter thumbnails use the selected photo. All processing happens locally; nothing uploads until Save photo. Input remains JPG/PNG/WebP, at most 5 MiB and 8000 pixels per dimension. Existing JPEG/thumbnail processing, private Storage and six-photo cap remain.
- Existing photos can be edited or replaced without removing them first, including at the six-photo limit. A successful replacement retains its row ID, ordering and creation time, uses fresh immutable Storage paths and then attempts old-byte cleanup. Cancelling does not change the saved photo. Uncertain network outcomes preserve potentially committed bytes and direct the member to refresh.
- Use as profile picture promotes an owned existing photo. Reordering retains every row ID and all photo metadata, in one atomic SQL statement that accommodates the existing immediate unique-slot constraint. No schema migration, reset or reseed is required.
- Chat has left/right received/sent bubbles, visible sender names, distinct colors, timestamps and delivery labels. History scrolls separately from the composer. Refreshing the conversation list keeps its cached rows visible, and delayed read receipts do not block loaded history. A new conversation shows loading/error feedback while history is fetched; switching conversations remounts its thread state.
- The composer has a paperclip attachment menu, image/file preview and removal, microphone/stop and send icon buttons with accessible names. Supported attachments remain photos, video and audio. Reply/edit/react/remove actions are in a compact message menu. Edits start with the current text. Desktop Enter sends, Shift+Enter inserts a line; coarse-pointer devices keep ordinary multiline Enter behavior.
- At phone widths, opening a thread replaces the conversation list and large page heading; the composer fits above bottom navigation, and Close returns to the list. No new external service, paid processing, package dependency or provider credential is introduced.

## Actual profile-save defect repaired

The original interest/prompt replacement statements used independent deleting and inserting CTEs. PostgreSQL could insert before the delete, producing `23505` duplicate-key failures on existing profiles. This was reproduced against real Supabase in a rollback-only probe. Replacement statements, including repeat onboarding, now explicitly consume the deletion result before inserting. A corresponding rollback-only probe succeeds with the expected three interests and one prompt. Local tests additionally exercise repeated saves/onboarding and preservation of the six existing photos.

## Validation

- Full workspace verification: 497 tests and all TypeScript checks; production Next.js build passes.
- Database tests cover replacement at six photos, ownership/path rejection, stable metadata, atomic primary selection, repeated saves and repeat onboarding. Crop geometry tests cover portrait/landscape bounds and rotated/zoomed positioning.
- Browser checks use the production web build, isolated marked real Auth accounts, actual hosted API/Storage/RPCs and unchanged profile handlers/stores over a certificate-verified Supabase HTTPS SQL transport. This test transport avoids the cloud environment's unavailable direct PostgreSQL connection; responses and persistence are not mocked. Final hosted API checks are required after deployment.
- Browser and release outcomes are recorded on the pull request. Only marked test users and their files are removed; original production counts are compared before and after.

## Boundaries

This updates responsive web and screens that embed it. It does not replace the legacy native messaging screen or claim physical-device camera, keyboard, microphone, accessibility or app-store release evidence. Generic PDF/ZIP/document attachments are not added. Photo edits replace the saved rendition; source originals and edit recipes are not retained as a reversible photo history. A previously issued private signed URL can remain valid until its existing expiry. If old-byte cleanup fails, storage maintenance may still be needed; no production-wide cleanup is forced.

Provider gates for calls, live video, email, payments and advertising are unchanged. Existing configured Supabase credentials/project and all applied migration files/ledgers are preserved.

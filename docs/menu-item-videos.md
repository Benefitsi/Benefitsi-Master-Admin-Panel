# Menu item videos

Each food or drink can have one optional video alongside its existing image.
The item editor selects, previews, replaces or removes the video. The native App
loads its player only after the guest opens the video's button; playback controls
include play/pause, seeking and sound. Closing or backgrounding stops playback.

The editor accepts MP4 files up to 50 MiB. Use H.264 for iOS/Android compatibility;
this feature does not transcode files or verify the codec inside an MP4 container.

## Upload and ownership

`createMenuItemVideoUpload` authorizes the menu and returns a signed, immutable
Storage upload target. The browser sends the file directly to `menu-videos`,
then `saveMenuItem` verifies its origin, partner/menu path and Storage metadata
before saving `menu_items.video_url`. The video file is never included in the
Next.js server action request.

Paths use `{partner_id}/{menu_id}/{random_uuid}.mp4`. Replacing or deleting a video
only removes its old object once no menu item still references it, including
duplicated items. Failed uploads/saves preserve the form draft and attempt cleanup
of unused uploads. Older action callers that omit `video_url` preserve that field.

## Rollout

1. Verify the reviewed Database `menu_item_videos` migration on Benefitsi App
   Staging, including the rollback SQL security fixture and real Storage upload.
   The bucket is public so guests can view menu videos.
2. After authorized Production release, install and verify the same reviewed
   migration on the Production database before deploying this editor there.
3. Deploy this editor against the migrated environment and verify its live form.
4. Verify native video playback and release the companion App through the
   existing Codemagic workflow. The App retains an explicit missing-column
   fallback during an additive rollout.

Staging was explicitly approved and migrated on 6 October 2026. All 13 real
Auth/Storage/menu API checks passed, including signed direct upload, actual MIME
and size, public byte-range delivery, menu save/read, authorization, immutable
overwrite rejection and reference-aware cleanup. The synthetic H.264/AAC MP4
decoded locally. Native playback is checked separately before App publication.
The user subsequently authorized completion and publication of all remaining
menu-video work. See Database PR 50's versioned Staging report and release record
for exact source, hosted migration-version mapping and final publication receipts.

## Focused checks

```sh
node --import tsx --test --test-concurrency=1 tests/menu-video*.test.mjs tests/menu-item-video*.test.mjs
npm exec -- tsc --noEmit --incremental false
```

The menu-video tests also run in the existing Security and quality CI workflow.

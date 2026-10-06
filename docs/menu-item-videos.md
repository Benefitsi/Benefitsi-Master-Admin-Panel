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

1. Review and apply the Database repository's `menu_item_videos` migration in
   Benefitsi App Staging, then run `tests/security/menu_item_video.sql` and verify
   a real Storage upload. The bucket is public so guests can view menu videos.
2. Deploy this editor against the migrated environment.
3. Release the companion App change through the existing Codemagic workflow.
   The App retains an explicit missing-column fallback during an additive rollout.
4. Follow the Database repository's separate Production release approval process.

The shared Staging migration currently awaits explicit approval because automatic
approval review rejected the persistent database/public-bucket change. Local tests
cover the editor, real Supabase SDK request boundaries and PostgreSQL access rules;
they do not establish live Storage service limits or actual device MP4 decoding.

## Focused checks

```sh
node --import tsx --test --test-concurrency=1 tests/menu-video*.test.mjs tests/menu-item-video*.test.mjs
npm exec -- tsc --noEmit --incremental false
```

The menu-video tests also run in the existing Security and quality CI workflow.

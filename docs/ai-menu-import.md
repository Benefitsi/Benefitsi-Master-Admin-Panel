# Reviewed menu import from photos and PDF

Admins and partner owners can select **Karte aus Foto / PDF** in their existing
menu editor. The same component is available before creating the first menu.
Recognition produces a temporary, editable preview; it does not save menu rows.
The final action checks ownership again and requires explicit confirmation.
It appends reviewed categories/items and preserves existing menu metadata and
content. A partner without a menu receives a new published menu at confirmation.

## Configuration

- `GEMINI_API_KEY`: server-only credential, shared with the existing research tool.
- `GEMINI_MENU_MODEL`: optional; defaults to `gemini-3.5-flash`.
- No database migration or new storage bucket is required.
- Selected files are sent inline to Google Gemini; the application does not store
  the source files. The file-selection screen discloses this before recognition.

Supports one PDF or up to eight JPEG/PNG/WebP images, totaling at most **4 MiB**.
The cap leaves multipart overhead beneath Vercel's 4.5 MB function request limit;
raising Next's `serverActions.bodySizeLimit` does not raise that hosting limit.
See [Vercel function limits](https://vercel.com/docs/functions/limitations).
Larger menus must be divided into smaller imports; direct storage uploads would
be a separate extension. HEIC, URL extraction, overwrite mode and automatic
currency conversion are outside this first version.

Recognition accepts up to 40 categories and 200 items per request. It rejects
incomplete/truncated responses rather than silently dropping content. Missing
prices stay empty, and explicit source currencies stay visible. Final saving
requires valid prices in EUR, matching the existing menu persistence contract.
Allergens are transcribed only from the source, never inferred from ingredients.
Source warnings/uncertainty notes stay visible during review but are not published;
relevant variants and extra charges must be added to the editable item description.

## Verification

Run `npm test` and `npm run build -- --webpack`. Dedicated suites cover provider
requests/output validation, entire-file validation, ownership boundaries,
review-before-write, append preservation, rollback, and the real React dialog.
Dialog tests simulate server responses; they do not call Gemini or a database.

During development, the complete test suite and production build passed. The
browser flow was checked using synthetic menu data, including missing-price
correction and confirmation at narrow widths. No production menu was modified.
The local configuration had no Gemini key, so real-provider extraction and
production database persistence still need a configured environment smoke test.

The existing persistence helper is not transactional: failed cleanup and
simultaneous first-menu creation retain the pre-existing system limitations.
The dialog blocks repeat submission after an uncertain save and asks the user
to reload and inspect the menu before retrying.

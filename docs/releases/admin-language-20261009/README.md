# Admin language completion · 9 October 2026

The top language control now covers navigation, forms, dialogs, loading and error states, and the current city, editorial, workspace, partner, microsite, analytics, bookings, commerce, SEO and system routes in English and German.

## Implementation

- Domain catalogues in `lib/admin-i18n/` contain reviewed complete phrases and anchored templates. Template parameters remain opaque data. Reviewed target-language copy is protected from the older substring fallbacks.
- The shared language preference survives route changes and storage restrictions. Nested providers use separate DOM scopes, and translated attributes update when React changes them.
- Editable text, stored partner/workspace names, public previews and authored content retain their original values. Select options retain explicit submitted values.
- Date and number rendering uses the selected locale from raw values. Shared analytics helpers retain their German defaults for existing exports.
- Streamed content retains the existing pending translation boundary until hydration. Workspace language changes update navigation confirmations without disposing its autosave session.

## Verification

Regression coverage includes real DOM switching in both directions, persistent and blocked-storage preferences, nested providers, late attribute updates, streamed hydration, opaque template values, authored content, navigation, formatting and pending workspace autosave.

The security and quality workflow runs every `tests/admin-language*.test.mjs` file alongside existing authorization, partner, workspace, city and microsite regressions, lint, types and the production build. Local checks reuse installed dependencies; no local production build or additional toolchain is required.

This release changes interface language and presentation. It introduces no database migration or business-rule change. Translation of user-authored content is outside the interface-language control.

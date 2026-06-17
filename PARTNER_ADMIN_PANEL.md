# Partner Admin Panel

## Purpose

The admin panel is the internal control surface for creating, editing, and reviewing partner records that power the Benefitsi app.

It is designed around two goals:

1. Keep the high-signal partner setup fields near the top so admins can finish the core setup quickly.
2. Keep nested or operational partner settings structured and validated so the app receives predictable data.

## Section Order

The partner setup flow is intentionally ordered like this:

1. `Profile`
2. `Contact and Location`
3. `Media`
4. `Stamp-card milestones`
5. `Deals`
6. `Operating Hours`
7. `Menu`
8. `Partner PIN`

### Why this order

- `Profile` contains the identity and activation state of the partner.
- `Contact and Location` contains the app-facing business details, address, map coordinates, and optional social handles.
- `Media` comes early because cards and discovery surfaces depend on it.
- `Stamp-card milestones` and `Deals` define the reward mechanics.
- `Operating Hours` and `Menu` are more operational and depend on the partner type.
- `Partner PIN` is read-only internal data, so it is shown last and openly rather than inside a collapsible section.

## Core Design Rules

### Required vs optional

- Required sections use the same asterisk treatment.
- `Stamp-card milestones` are mandatory during partner creation.
- Social media is optional.
- Deals are recommended but not required.
- Media is recommended because the partner appears better across cards and lists with images.

### Menu visibility

- The `Menu` section is shown only when the normalized partner type is `Food & Drink`.
- If the partner type changes away from `Food & Drink`, starter menu creation is disabled.

### Save behavior

- In create mode, the partner setup is handled as one main flow, with the final submit button placed after the last setup sections.
- In edit mode, nested entities such as milestones, deals, operating hours, and menu entries keep their own dedicated editors and server actions.
- The read-only `Partner PIN` display is not a separate section and does not require its own save action.

## Profile

Fields:

- Partner name
- Partner type
- Partner city
- Partner owner
- Email
- Active
- Featured
- Description
- Categories

Logic:

- `Featured` is surfaced in both the partner list and the top dashboard statistics.
- The partner list shows a star-based featured badge for quick scanning.

## Contact and Location

Fields:

- Phone
- Website
- Coordinates
- Address
- Social media handles

Logic:

- Social handles live inside this section because they are contact-facing, not operational.
- Social platform selection is restricted to:
  - `Facebook`
  - `Instagram`
  - `TikTok`
  - `X`
- The admin can store a handle or full profile URL, and the backend normalizes it into the canonical partner social URL.

## Media

This section is marked as recommended.

Fields:

- `Partner logo`
- `Feature card`
- `Discover page image`
- `Cover images`

Current image sizing rules:

- `Logo`: preserved as the configured logo format
- `Feature card`: `720 x 470`
- `Discover page image`: `440 x 500`
- `Cover image`: `1200 x 1200`
- `Menu item image`: `720 x 490`

Logic:

- Images are resized client-side for preview preparation.
- Images are resized again on the backend before upload to keep storage consistent.
- The discover image maps to `discover_card_image_url`.

## Stamp-Card Milestones

This section is required during partner creation.

Purpose:

- Defines the reward thresholds for the stamp-card system.

Logic:

- At least one milestone must exist before a partner can be created.
- Required stamps are capped by the configured stamp-card maximum.
- Generic copy is auto-filled if customer-facing or staff-facing text is left blank.

## Deals

This section is marked as recommended.

Purpose:

- Controls direct, automatic, fallback, and special campaign-style offers.

Logic:

- The backend validates deal type compatibility, benefit-category rules, timing logic, stock, and redemption limits.
- Automatic deals must keep unique priority values per partner.
- Deal copy is preserved carefully to avoid accidental overwrites when backend-driven defaults are involved.

## Operating Hours

Purpose:

- Stores weekly opening hours and holiday closures used by the app.

Fields:

- Weekly opening and closing times per weekday
- Optional weekday note/label
- Holiday closures
- Optional holiday label

Logic:

- Bulk time application can fill all open weekdays quickly.
- A weekday must either be marked closed or have both opening and closing times.
- Holiday closures support multiple dates.
- Holiday labels are optional and help explain special closures such as public holidays or private events.

## Menu

Shown only for `Food & Drink` partners.

Purpose:

- Stores one partner menu with categories and items.

Structure:

- One partner menu
- Multiple menu categories
- Multiple menu items

Logic:

- Categories and items can be reordered.
- Menu review status is surfaced clearly.
- Menu summary stats are shown in compact chips:
  - categories
  - items
  - last updated time

## Partner Staff and Scanners

Purpose:

- Grants partner-specific operational access.

Rules:

- Admins can assign a user as either:
  - `scanner`
  - `admin`
- The form is intentionally simplified.
- The old extra visibility toggle and active-state editing were removed from this flow.

## Redemption History

Purpose:

- Shows partner redemption events and the reward bundle applied by the server.

Logic:

- The history displays the user who scanned the QR code using the stored staff user fields.

## Removed Admin Areas

The following admin concepts were intentionally removed from this panel:

- QR security section
- Fraud events section
- Audit events section

## Validation and Safety Rules

The panel now enforces character limits in both the UI and the server actions to reduce the chance of oversized text payloads entering the database.

Wherever a field has a character limit, the UI also shows the live character count together with the maximum allowed length.

Examples of guarded fields:

- names and titles
- descriptions
- terms
- staff instructions
- reward item text
- addresses
- websites
- social handles
- holiday labels
- menu tags and allergens

This means the limits are not only browser-side convenience rules; the backend also validates them before saving.

## App Settings Guidance

If the partner settings experience is mirrored in the app, keep these same product rules:

- Use the same section order.
- Keep social media under contact.
- Show menu only for `Food & Drink`.
- Keep the partner PIN read-only and last.
- Treat media and deals as recommended.
- Require at least one milestone before a stamp-card partner is considered complete.
- Keep holiday closures multi-date with optional labels.
- Preserve the same character limits, live counters, and validation rules on the app side for parity.

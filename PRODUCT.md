# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Benefitsi administrators configure and publish partner microsites from the master admin panel.
- Partner teams review and customize the page that presents their business, offers, loyalty rewards, services, and contact details.
- Local customers use the public microsite to understand the partner quickly and act on Benefitsi deals, rewards, menus or services, and contact information.

## Product Purpose

The Benefitsi Master Admin Panel manages partner records and the public microsites generated from them. A successful microsite carries trusted partner-profile data into a polished, responsive page while keeping campaign copy, imagery, theme, and publishing workflow editable by administrators.

## Positioning

Partner microsites combine a partner's real operational profile with Benefitsi-specific deals and loyalty mechanics, so the public page is both a local-business introduction and a direct path into Benefitsi benefits.

## Operating Context

- Administrators edit a draft microsite, preview desktop and mobile states, complete readiness checks, and publish a versioned configuration.
- Partner profile media remains the source of truth for the partner logo.
- Public pages are rendered from partner data plus a sanitized published microsite configuration.

## Capabilities and Constraints

- The product uses Next.js App Router, React, TypeScript, Tailwind CSS, Supabase, and versioned JSON microsite configuration.
- The default microsite must support responsive desktop, tablet, and mobile layouts.
- The default template is the only selectable microsite template; older stored template IDs must resolve safely to it.
- The theme always has three colors, supports automatic logo-derived selection with a professional fallback, and supports manual control.
- Microsite imagery may come from partner-managed remote storage hosts, so the renderer currently supports ordinary image elements for arbitrary admin-selected URLs.
- Inferred from the current product data and requested default-template strategy: the default should remain useful across partner categories, while category-specific content appears only when relevant.

## Brand Commitments

- Preserve the Benefitsi name, Benefitsi logos, partner logos, and the user's supplied responsive hero reference as binding design direction.
- Partner identity leads; Benefitsi appears as the trust and loyalty layer.
- Public copy is primarily German, with builder translation support for English administration.

## Evidence on Hand

- Partner logos, feature/discovery images, cover images, business details, operating hours, deals, reward milestones, menus, and social links are present in the repository's partner model.
- Benefitsi logo, app icon, QR placeholder, and partner-detail app screenshot assets exist under `public/`.
- No supplied testimonial or customer quote may be fabricated; the quote area uses editable partner-authored copy with a neutral default.

## Product Principles

- Partner data is the source of truth; microsite overrides are deliberate and versioned.
- A visitor should understand the partner, current benefit, location/status, and next action within the first viewport.
- Customization must remain safe: automatic defaults should look intentional, while manual controls stay explicit and reversible.
- Motion should reinforce reading and discovery without hiding content or excluding reduced-motion users.

## Accessibility & Inclusion

Interactive controls must be keyboard accessible, visible content must not depend on motion, and animation must honor `prefers-reduced-motion`.

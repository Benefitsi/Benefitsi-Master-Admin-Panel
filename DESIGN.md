---
name: Benefitsi Partner Microsite
description: A partner-first, image-led microsite system with a responsive three-color identity.
colors:
  partner-primary: "#f97316"
  partner-secondary: "#172554"
  partner-tertiary: "#14b8a6"
  paper: "#f7f3ee"
  surface: "#ffffff"
  ink: "#18181b"
  muted-ink: "#52525b"
typography:
  display:
    fontFamily: "Satoshi, Avenir Next, Segoe UI, sans-serif"
    fontSize: "clamp(2.45rem, 6.2cqw, 5.7rem)"
    fontWeight: 900
    lineHeight: 0.94
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Satoshi, Avenir Next, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 4.8cqw, 3.3rem)"
    fontWeight: 900
    lineHeight: 1.04
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Satoshi, Avenir Next, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Satoshi, Avenir Next, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    lineHeight: 1.25
rounded:
  control: "12px"
  card: "16px"
  feature: "24px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.partner-primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "14px 24px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.partner-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "14px 24px"
  feature-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.partner-secondary}"
    rounded: "{rounded.card}"
    padding: "20px"
---

# Design System: Benefitsi Partner Microsite

## Overview

**Creative North Star: "The Partner Spotlight"**

The partner owns the stage: real business imagery, name, location, availability, and next actions resolve into one responsive benefit card. Benefitsi is the trust and loyalty layer, visible through compact badges and supporting utility rather than competing brand chrome.

The atmosphere is professional and approachable. White surfaces sit over softly tinted fields, bold Satoshi headings establish hierarchy, and motion helps visitors discover content without becoming a prerequisite for reading it. Each partner can change the mood through the logo-derived three-color theme while the composition and contrast discipline remain stable.

**Key Characteristics:**

- Partner photography is the primary visual material.
- A three-color identity controls action, contrast, and highlight roles.
- Compact rounded controls sit inside restrained glass and paper surfaces.
- Motion is responsive to scroll, pointer, and reduced-motion preferences.

## Colors

The palette is semantic and partner-controlled: the frontmatter records the professional fallback, while runtime values may be extracted from the partner logo or set manually.

### Primary

- **Partner Signal:** The primary action and emphasis color. It should be the most energetic logo-derived color and remain readable with white text.

### Secondary

- **Partner Ink:** The dark contrast color for display text, deep panels, and image badges.

### Tertiary

- **Partner Highlight:** The supporting contrast color for icons, focus treatment, and atmospheric accents.

### Neutral

- **Warm Paper:** The page field behind content sections.
- **Clean Surface:** The card and control surface.
- **Near-Black Ink:** High-priority neutral copy.
- **Muted Ink:** Supporting descriptions and metadata.

### Named Rules

**The Three-Color Rule.** Every partner theme has exactly primary, secondary, and tertiary roles; automatic extraction and manual selection feed the same roles.

**The Contrast Before Fidelity Rule.** A logo color may be tuned or replaced when it cannot support readable text or a distinct three-color palette.

## Typography

**Display Font:** Satoshi (with Avenir Next, Segoe UI, and sans-serif fallbacks)

**Body Font:** Satoshi (with Avenir Next, Segoe UI, and sans-serif fallbacks)

**Character:** Heavy, compact display type gives partner names immediate presence. Body text stays open and neutral; italics provide a light editorial accent without introducing a second typeface.

### Hierarchy

- **Display** (900, fluid 2.45–5.7rem, 0.94): partner names and the quote reveal.
- **Headline** (900, fluid 2–3.3rem, 1.04): section-level messages.
- **Title** (700–900, 1.25–1.5rem, tight): cards, dialogs, and grouped details.
- **Body** (400–600, 1rem, 1.75): descriptions, supporting copy, and longer explanations; keep readable lines near 65ch or shorter.
- **Label** (800, 0.875rem, 1.25): buttons, badges, compact metadata, and status text.

### Named Rules

**The Forty-Thousandths Rule.** Tight display tracking stops at -0.04em; supporting text uses natural or nearly natural tracking.

## Layout

The public microsite is a container-query surface capped at 80rem. The hero uses one continuous photographic plane at every width, with copy and actions placed over a left-to-right translucent glass veil. Desktop keeps the copy near 54% of the width and uses a four-column glass tray; tablet compresses the same four-column tray beneath a narrower copy field; mobile hides the navbar business-name lockup, stacks the actions, and changes the tray into four vertical rows. These are three authored layouts rather than one desktop composition that merely shrinks.

The spacing rhythm uses 8, 12, 20, and 32px steps with 48px as the standard section interval. Major content remains inside the shared maximum width; atmospheric fields and dark quote bands may extend to the section edge. The first viewport must identify the partner, location or status, primary benefit, and next action.

## Elevation & Depth

Depth is ambient rather than structural. Large surfaces use broad, low-opacity shadows; the hero alone uses a functional glass layer because partner imagery visibly continues beneath it. The feature tray uses a liquid-glass treatment: strong backdrop blur, restrained saturation, inset specular edges, a pointer-responsive highlight, and a compact offset shadow that remains inside the hero bounds. All main sections share one warm paper field to avoid abrupt color bands, while the footer may use a slightly deeper neutral. Hero parallax is deliberately limited so motion never reads as image zoom.

### Shadow Vocabulary

- **Hero Atmosphere** (`0 28px 80px -35px rgba(15,23,42,.28)`): the outer partner card only.
- **Floating Badge** (`0 16px 38px rgba(0,0,0,.18)`): compact badges placed over photography.
- **Quiet Card** (`0 24px 64px rgba(15,23,42,.07)`): feature and information cards that need separation from warm paper.

### Named Rules

**The Image Carries Depth Rule.** Use real partner imagery, crop, overlap, and restrained ambient shadow before adding decorative effects.

## Shapes

Controls use gently rounded 12px corners, ordinary cards use 16px corners, and focal surfaces may use 24px corners. Full pills are reserved for navigation capsules, badges, chips, and small selectors. Thin borders separate pale surfaces; image crops and clipped atmospheric fields supply the largest silhouettes.

## Components

### Buttons

- **Shape:** Compact rounded rectangle (12px) with a minimum 48px touch height.
- **Primary:** Partner primary background, white text, and 14px by 24px padding.
- **Hover / Focus:** Lift by a few pixels on hover; use a visible tertiary-derived focus outline and disable transforms for reduced motion.
- **Secondary:** White surface, partner-secondary text, and a low-contrast border.

### Chips

- **Style:** Full-pill shape for filters and compact state selectors, using a thin border and strong label weight.
- **State:** Selected chips use the partner primary color; unselected chips use a white or warm neutral surface.

### Cards / Containers

- **Corner Style:** 16px for supporting cards and 24px for focal feature containers.
- **Background:** White or near-white over warm paper and logo-tinted atmosphere.
- **Shadow Strategy:** Quiet ambient elevation; avoid hard offset shadows.
- **Border:** One subtle border is sufficient when a shadow is present.
- **Internal Padding:** 20px normally, rising to 32px on spacious focal surfaces.

### Inputs / Fields

- **Style:** White or zinc-tinted surface, 12px corners, and a quiet neutral border.
- **Focus:** Border shifts to the partner primary color with a visible outline.
- **Disabled:** Preserve legibility while reducing interaction emphasis; automatic palette fields remain visible but inactive.

### Navigation

Desktop navigation is a clean white row with the partner mark and name on the left, unboxed text links in the middle, and the primary deal action on the right. Tablet and mobile replace the links with a compact icon-only menu button and a floating list of the same destinations.

### Partner Hero

The signature component pairs partner identity and actions with one interactive, full-bleed photographic stage. A masked backdrop blur and translucent warm-white gradient create functional glass over the left copy field while keeping the image visibly transmitted beneath it. The feature tray floats over the same image plane with a stronger blur and warm ambient glow: horizontal on desktop and tablet, vertical on mobile. A small downward chevron closes the first-screen composition.

### Quote Reveal

The partner quote stays on the same warm paper surface as the surrounding sections. Its left-aligned display type reserves the complete final layout from the start while individual characters fade in like smooth handwriting, so line breaks never jump. It exposes the complete quotation to assistive technology and renders immediately when reduced motion is requested.

## Do's and Don'ts

### Do:

- **Do** derive or manually set all three partner color roles together.
- **Do** use real partner photography as the focal material and provide a professional fallback palette when extraction fails.
- **Do** keep important text and actions available before animation begins.
- **Do** use icons from the established Lucide and React Icons libraries with consistent stroke weight and sizing.
- **Do** test desktop, tablet, mobile, keyboard focus, and reduced-motion behavior.

### Don't:

- **Don't** introduce alternate page templates; the Standard template is the single durable system.
- **Don't** use section eyebrows, emoji, Unicode glyphs, gradient text, or hard offset shadows as decoration.
- **Don't** tighten display tracking beyond -0.04em.
- **Don't** let automatic logo extraction create low-contrast text or indistinguishable theme roles.
- **Don't** hide content permanently when observers, scripts, or animation preferences are unavailable.

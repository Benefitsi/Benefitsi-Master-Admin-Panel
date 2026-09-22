# Agent profile section labels — local holiday QA

The real rendered Admin AgentOverview at reviewed source 28ec89f (same tree as live main a5152ab) contains `aria-labelledby="section-Weitere beobachtete Profile"` and an h2 with that entire whitespace-containing ID. ARIA interprets the value as three ID references, none of which resolves. The Benefitsi section label resolves correctly; the other observed profiles section loses its accessible region name. This is a source-backed local reproduction, not a complete screen-reader acceptance.

Correct profile-section heading references so both visible section titles resolve as accessible region names. IDs must be valid single references, unique within the overview and independent of display text. Preserve headings, content, counts, cards, native details/summary keyboard behavior, layout, data/auth/freshness rules and existing links. Do not change external systems or unrelated UI.

Use existing installed tooling; no new dependencies, downloads, data or credentials. Regression must render the real component with both sections and verify referenced DOM headings resolve uniquely to the expected visible titles; do not assert a chosen implementation string. Focused agent-control UI tests, scoped lint and typecheck are sufficient unless a concrete failure warrants more. Controller will separately verify accessibility and native detail toggles in a local browser fixture. No signed-in production or full screen-reader claim.

This heartbeat permits only local reversible work: no push, PR, merge, deployment, M1/Notion or scheduler/model/rights changes. Keep the reviewed branch for a later expressly permitted release.

## Local verification

Implementation60be4d3: behavior-specific RED→GREEN, 15 focused tests, scoped lint/types clean. An additional full run returned435 passed with existing test logging. Actual local browser changed the other-profile accessible region count from0 to1 while retaining the Benefitsi region. All14 profile details were reached via Tab, opened with Enter and closed with Space with visible focus. Existing city/automation links were focused, not activated. Stale metadata is explicitly shown. No full screen-reader, signed-in Production or release acceptance is claimed.

# City status interpretation correction

Spec: `docs/city-status-semantics-spec-20260922.md`.

## Global constraints

- Technical health, partial overall result, editorial review and publication configuration are independent facts.
- Use the observed producer fields; missing/malformed evidence stays unknown and explicit technical false stays false.
- Pending editorial work remains visible even with auto-publish configured.
- Preserve freshness, authentication, private-data projection, noindex and business gates.
- No source-external writes, schedules, models, database, permission or collector changes.

### Task 1: Correct actual City result mapping and card labels

Read the spec and compare the actual publisher payload with normalizePipeline and the city card. Add meaningful failing loader/render regressions, make the smallest correction preserving old supported metadata and all bounds, then run the focused agent-control data/UI suites, typecheck and scoped lint. Do not repeat the whole Admin suite absent a concrete concern. Commit only intended product/test changes, excluding root-owned plan/spec; write exact RED/GREEN evidence and remaining boundaries to the SDD report. Controller handles production build and real-payload rendering.

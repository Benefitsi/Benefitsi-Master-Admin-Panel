# Agent region label correction

Spec: docs/agent-region-a11y-spec-20260922.md.

## Global constraints

- Profile sections must resolve to their existing visible heading names through valid, unique DOM references.
- IDs are independent of display text; existing content, layout, details keyboard behavior, links, auth, freshness and data contracts remain unchanged.
- Local reversible work only; no dependencies, network, push, PR, merge, deployment, M1/Notion, model/scheduler or rights changes.

### Task 1: Correct profile region heading references

Read the spec first and relevant AGENTS.md/installed framework guidance before coding. Reproduce with a behavior-level failing render/DOM test covering both profile groups, including the title containing spaces. Make the minimal correction, run focused agent-control UI tests, scoped lint and typecheck. Existing dependencies can be temporarily symlinked from ../agent-control-20260921/node_modules; do not install packages. Commit only intended product/test files. Do not include controller-owned plan/spec. Write exact RED/GREEN commands/results, commit and remaining boundaries to the task report. No subagents. Controller owns review and local browser acceptance.

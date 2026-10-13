# Benefitsi M1 controls

This installs bounded controls into the existing authenticated bridge. It does not change secrets, service launchers, provider credentials, current models, schedules, or the read-only source registry.

- `/hermes/profiles`: six fixed profile IDs, 19 fixed Markdown file choices, native authenticated model catalog, optimistic native model save and readback. Finance is deterministic; model mutations are refused.
- `/benefitsi/knowledge`: registered Benefitsi source only. Create-only UUID notes in three fixed folders, byte SHA-256 readback, idempotent retry, task metadata and UUID note reading. No editing existing notes or general paths.
- `/hermes/menu-extract`: existing schema-2 service, authenticated 6-MiB body bound, sanitized errors and actual saved profile routing with quota, verified EUR budget and no replay. See `../menu-agent`. Native Codex lacks a wire output cap and is refused. Other models require verified private cost evidence. No speculative prices are seeded.

`install_benefitsi_controls.py` verifies the existing bridge SHA before adding an authenticated dispatch hook, saves only changed source/context files, installs the four modules, and adds a small knowledge guide to each native profile. It uses no credential or model writes. A controlled reload through the existing Runtime supervisor is a separate operator step; preserve current external workers and wait for in-flight requests first.

The existing knowledge mirror stays read-only. Newly created notes can be read immediately through the UUID route; receipts accurately report that mirror synchronization is pending. New tasks enter the dashboard priorities. Tasks marked `status: done` in Obsidian leave the open task list. Important new work should be recorded through the bounded helper described in each profile's `KNOWLEDGE.md`; full sessions and credentials are excluded.

Run the Python regression files with `PYTHONDONTWRITEBYTECODE=1`; fixtures use automatically removed temporary directories and make no provider requests.

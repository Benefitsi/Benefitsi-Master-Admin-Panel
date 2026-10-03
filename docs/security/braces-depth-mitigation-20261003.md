# Braces depth mitigation — 2026-10-03

The release audit reports [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) / CVE-2026-93687 against Braces 3.0.3. The advisory affects versions through 3.0.3 and lists no patched release. It describes stack exhaustion in recursive parsing and AST walkers. The npm registry also lists 3.0.3 as the latest Braces release. Upgrading Next's lint packages does not remove the vulnerable chain; npm's proposed Next 14 lint downgrade would be a breaking and unrelated change.

The override uses the mitigation in [upstream PR #72](https://github.com/micromatch/braces/pull/72), which is still open, at immutable commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`. Its parser and compile/expand/stringify walkers enforce a maximum nesting depth of 100, including caller-supplied ASTs. The MIT package retains its real name and version. The archive is pinned by its full commit URL and lockfile SHA-512 integrity:

```
https://codeload.github.com/FSDevelop/braces/tar.gz/28d440b5dd449dbf1fe6f3506cf94ecca4d02660
sha512-JDNujUUIiVjCw6vVXM92wZbpm+K+0KSTTqjcVa1zjjZLvfkOuDZmVHbKKjYRyE450ii6coDbuCIPqkX/bjmxWQ==
```

The dependency exists only in this development chain, with `dev: true` required for every installed lockfile node:

```
eslint-config-next@16.3.6
└─ @next/eslint-plugin-next@16.3.6
   └─ fast-glob@3.3.1
      └─ micromatch@4.0.8
         └─ braces@3.0.3 (pinned source mitigation)
```

`npm run audit` saves the complete unchanged scanner output before evaluating it. CI uploads that JSON as `dependency-audit-<run_id>` and publishes the raw counts in its visible step summary. npm continues to report five high findings because the fixed source still has version 3.0.3. The gate reports those findings explicitly as source-mitigated; it does not claim a clean raw audit or lower the audit severity threshold.

The gate accepts that single, exact advisory and its four exact transitive findings only when the archive URL, integrity, installed package.json, entrypoint, every runtime library hash, dependency versions, paths and development flags all match. Any new finding at any severity, a second advisory on the same package, changed advisory metadata, additional installed Braces copy, source change, scanner failure, or production dependency blocks the release. The exact constants live in `lib/dependency-audit-guard.mjs`; tests use independent expected hashes and rejection fixtures.

Every audit command must also pass actual Braces public API regressions for brace/parenthesis nesting, direct AST walkers, the depth cap, ordinary expansion and escaping, plus micromatch and fast-glob consumer checks. These run against the installed dependency. CI retains normal lint, TypeScript and production-build checks. This is a bounded release mitigation for unreleased upstream source; replace the override and remove this special gate once an official patched release is available and verified. Review is required if the advisory or chain changes.

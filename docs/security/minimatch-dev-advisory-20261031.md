# Accepted development-only minimatch advisory (2026-10-31)

On 2026-10-31 the release audit started reporting [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). It is a moderate denial of service in `minimatch` through globparts amplification, affecting `minimatch <11.0.1`. Every PR then failed the "Audit dependencies and verify source mitigation" step.

## Where the package comes from

In this repository, `minimatch` is installed only through the lint toolchain. All of these are `dev: true` in `package-lock.json`:

- `eslint@9`
- `@eslint/config-array`
- `@eslint/eslintrc`
- `eslint-config-next`
- `eslint-plugin-import`
- `eslint-plugin-jsx-a11y`
- `eslint-plugin-react`
- `typescript-eslint`

The package never ships in the production build. The only way to reach it is to run ESLint on glob patterns from this repository.

## Why there is no upgrade

Patched versions start at 11.0.1. ESLint 9 and its plugins require the `minimatch@3` CommonJS API. An override to 11 would break lint, and no ESLint release uses a fixed version yet.

## Decision

Patrick accepted the advisory as a development-only risk on 2026-10-31.

## What the gate accepts

The audit gate (`ACCEPTED_DEV_ADVISORIES` in `lib/dependency-audit-guard.mjs`) accepts the advisory only if all of the following hold:

- The root advisory object has exactly this URL, package, severity (`moderate`) and range (`<11.0.1`).
- Every reported package has severity `moderate` or lower.
- Every reported package's `via` is either that advisory object or another package that the audit also reports.
- Every lockfile node of every reported package is `dev: true`.

Any of the following still blocks the release:

- A production path.
- A higher severity.
- Changed advisory metadata.
- A second advisory.
- Any unrelated finding.

The Braces source mitigation is unchanged and still verified on its own.

## When to remove it

Remove this entry once ESLint and its plugins use `minimatch >=11.0.1`, or once a patched 3.x release exists.

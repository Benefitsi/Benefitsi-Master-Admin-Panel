# Besuchslevel reference

Route: `/partners/visit-levels?category=Doner+Kebab`. Category names are the
canonical values from `lib/partner-categories.ts`; aliases normalize to them.
An optional `frequency=high|medium|low` limits the table. An empty category
selects partners without a category. Partner management links to the selected
partner's first category. No new primary navigation area is added.

The page requires the existing Admin session before it reads partners. It loads
only `id,name,category,level_frequency` with pagination, through the existing
authenticated Supabase client. It has no writes. Category membership and
frequency always come from the partner records; there is no category default.
Mixed frequencies remain separate configurations. Missing/unknown values are
explicitly marked with the App's existing high-frequency fallback. Failed reads
are distinct from successfully read categories without any partners.

## Rule source and synchronization

Do not edit `lib/generated/partner-visit-levels.json` by hand. It is copied
byte-for-byte from `Benefitsi/Benefitsi-App/contracts/partner-visit-levels.json`.
The App's `partner_level_contract_test.dart` compares every exported field,
frequency alias, threshold and label with the runtime service on every test run.
Its normal Codemagic workflow includes that test.

After changing the App rules, regenerate/test/commit the App export first (see
the App's `docs/partner-visit-levels.md`). Then run from this repository:

```sh
node scripts/sync-partner-visit-levels.mjs /absolute/path/to/Benefitsi-App
node scripts/sync-partner-visit-levels.mjs --check /absolute/path/to/Benefitsi-App
node --import tsx --test tests/partner-visit-levels.test.mjs tests/partner-visit-level-data.test.mjs tests/partner-visit-level-page.test.mjs
```

The generated provenance file pins the source repository, commit, file paths,
and SHA-256 hashes. `--check` rejects any cross-repository difference, including
a changed source or revision. Admin CI checks the vendored contract fingerprint
and the rendering, grouping, fallback, pagination and authorization behaviors.
The App is private; Admin CI does not have cross-repository credentials and does
not silently download an unpinned latest file. A future App-rule change requires
this explicit sync and a paired review; Admin deployments use the recorded pin.

## Release status

Bronze IV at zero is the new requested rule. The reference clearly marks its App
delivery as unconfirmed; an older installed App can still show no level at zero.
Keep that notice until the normal App release process supplies a verified build
containing this change. Admin deployment alone is not evidence of an installed
App update. No partner configurations or existing visit counts are changed.

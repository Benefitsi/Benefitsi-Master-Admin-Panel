# Partner visual integration preview

Generate the existing production components offline:

```sh
node scripts/preview-partner-release.mjs /private/tmp/task9-partner-preview
```

The generator renders `PartnerDashboard`, `PartnerOverview`, `PartnerStatisticsToolbar`, `PartnerStatistics`, `PartnerPlanSummary`, `PartnerPlanPanel`, and the existing `PartnerWorkspace`. It copies the original brand SVGs and Satoshi font, compiles the application's Tailwind styles and uses the existing German translation function. Transport/server actions are blocked by the test loader. Every form control is disabled; unavailable links are removed. Native disclosure elements and links between generated sections work; there is no hydrated editing, authentication, API, provider, export, scanner or persistence behavior.

For each `free`, `pro`, `founder`, `expired`, and `demo` scenario: `NAME-overview.html`, `NAME-statistics.html`, `NAME-billing.html`, `NAME-business.html`, `NAME-deals.html`, `NAME-admin.html`. `NAME.html` aliases statistics. Existing canonical `release-v1.json` remains unchanged. `visual-demo.json` is a separately labelled, manually authored synthetic seven-day fixture, also copied byte-for-byte into App tests. Its visits sum to 280 in daily, weekly and monthly projections; 40 guests, 12 returning guests, authoritative share 0.3 and 14 redemptions. No production fallback references it.

The overview displays the provided aggregate's exact range; production overview remains the existing seven-day request, and native Home now uses the same seven-day request. Statistics is comparable only for the same explicit selected period. Protected statuses never become numeric zero.

Root/controller owns loopback serving and browser acceptance. The generator does not start or change a server and never connects to a live service.

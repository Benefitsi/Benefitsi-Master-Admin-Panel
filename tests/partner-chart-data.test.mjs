import test from "node:test";
import assert from "node:assert/strict";
import { loadUi } from "./helpers/partner-ui-fixtures.mjs";
const { chartBuckets, metricNumber } = loadUi("lib/partners/chart-data.ts");
test("only released finite nonnegative chart points; malformed series fails closed", () => {
  const buckets = [{ start: "2026-09-01T00:00:00+02:00", visits: 0 }];
  for (const status of [
    "locked",
    "suppressed",
    "unavailable",
    "error",
    "not_yet_evaluable",
  ])
    assert.deepEqual(chartBuckets({ status, buckets }), []);
  assert.deepEqual(chartBuckets({ status: "empty", buckets }), buckets);
  for (const visits of [NaN, Infinity, -1, "2"])
    assert.deepEqual(
      chartBuckets({ status: "ok", buckets: [{ ...buckets[0], visits }] }),
      [],
    );
  assert.deepEqual(
    chartBuckets({ status: "ok", buckets: [{ start: "bad", visits: 1 }] }),
    [],
  );
  assert.deepEqual(chartBuckets({ status: "ok", buckets: [] }), []);
  assert.equal(metricNumber({ status: "suppressed", value: 9 }), null);
  assert.equal(metricNumber({ status: "ok", value: Infinity }), null);
  assert.equal(metricNumber({ status: "empty", value: 0 }), 0);
});
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
const { PartnerStatistics } = loadUi(
  "components/partner/partner-statistics.tsx",
);
test("explicit visual demo balances all visit series and renders identical aggregate units", () => {
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/partner-dashboard/visual-demo.json", "utf8"),
  );
  const d = fixture.scenarios.demo.dashboard;
  for (const series of Object.values(d.series))
    assert.equal(
      chartBuckets(series).reduce((n, b) => n + b.visits, 0),
      d.metrics.visits.value,
    );
  assert.equal(
    d.metrics.returning_guest_share.value,
    d.metrics.returning_guests.value / d.metrics.guests.value,
  );
  const html = render(h(PartnerStatistics, { data: d }));
  for (const value of [
    "280",
    "40",
    "30",
    "14",
    "4,3 / 5",
    "21.09.2026",
    "27.09.2026",
  ])
    assert.ok(html.includes(value), value);
  assert.match(html, /Besuchsverlauf/);
  assert.doesNotMatch(html, /NaN|Infinity|Vergleichszeitraum.*path/);
});
test("suppressed stale breakdowns and feedback never render plotted values", () => {
  const d = JSON.parse(
    readFileSync("tests/fixtures/partner-dashboard/visual-demo.json", "utf8"),
  ).scenarios.demo.dashboard;
  d.breakdowns.status = "suppressed";
  d.metrics.feedback.status = "suppressed";
  d.metrics.feedback.average_rating = 4.9876;
  for (const s of Object.values(d.series)) {
    s.status = "suppressed";
    s.buckets = [{ start: "2026-09-01T00:00:00Z", visits: 999999 }];
  }
  const html = render(h(PartnerStatistics, { data: d }));
  assert.doesNotMatch(html, /999999|4,9876|>Mo<|>Verständlich</);
});
import { JSDOM } from "jsdom";
import { loadPreview } from "../scripts/partner-preview-loader.mjs";
test("feedback and distribution are siblings of the trend row, not nested within it", () => {
  const data = JSON.parse(
    readFileSync("tests/fixtures/partner-dashboard/visual-demo.json", "utf8"),
  ).scenarios.demo.dashboard;
  const dom = new JSDOM(render(h(PartnerStatistics, { data })));
  const title = [...dom.window.document.querySelectorAll("h3")].find(
    (e) => e.textContent === "Besuchsverlauf",
  );
  assert.ok(title);
  assert.doesNotMatch(
    title.closest("section").textContent,
    /Gästefeedback|Besuchszeiten & Verteilung/,
  );
  assert.equal(
    dom.window.document.querySelectorAll('svg[role="img"]').length,
    3,
  );
});
test("portal workspace keeps the real editor but hides global admin selectors", () => {
  const { PartnerWorkspace } = loadPreview("app/partner-admin.tsx");
  const p = {
    id: "synthetic",
    name: "Demo",
    category: [],
    deals: [],
    holidays: [],
    socials: [],
    reward_milestones: [],
    staff: [],
    opening_hours: [],
    menus: [],
    stamp_progress: [],
    visits: [],
    fraud_events: [],
    microsite: null,
  };
  const props = {
    partners: [p],
    cities: [],
    owners: [],
    initialPartnerId: p.id,
    initialView: "settings",
  };
  const portal = render(
    h(PartnerWorkspace, {
      ...props,
      portalMode: true,
      micrositeEditingEnabled: false,
      adminAccess: false,
    }),
  );
  assert.doesNotMatch(
    portal,
    /Search partners|Select a partner to edit|Active partners|Sort by/,
  );
  assert.match(portal, /name="name"/);
  assert.match(render(h(PartnerWorkspace, props)), /Search partners/);
});
const { PartnerDashboard } = loadUi("components/partner/partner-dashboard.tsx");
test("header retains language/signout and gates platform admin and commerce navigation", () => {
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/partner-dashboard/visual-demo.json", "utf8"),
  ).scenarios.demo;
  const rights = structuredClone(fixture.billing.entitlements);
  const props = {
    partnerId: rights.partner_id,
    name: "Demo",
    partners: [],
    rights,
    active: "overview",
    children: null,
    accountName: "Synthetisches Konto",
  };
  const old = process.env.BENEFITSI_COMMERCE_ENABLED;
  try {
    process.env.BENEFITSI_COMMERCE_ENABLED = "true";
    rights.features.commerce = true;
    let html = render(h(PartnerDashboard, props));
    assert.match(html, /Abmelden/);
    assert.match(html, /Synthetisches Konto/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /href="\/partner\/commerce"/);
    assert.doesNotMatch(html, /Admin-Bereich/);
    assert.match(
      render(h(PartnerDashboard, { ...props, isAdmin: true })),
      /Admin-Bereich/,
    );
    rights.features.commerce = false;
    assert.doesNotMatch(
      render(h(PartnerDashboard, props)),
      /href="\/partner\/commerce"/,
    );
    rights.features.commerce = true;
    process.env.BENEFITSI_COMMERCE_ENABLED = "false";
    assert.doesNotMatch(
      render(h(PartnerDashboard, props)),
      /href="\/partner\/commerce"/,
    );
    process.env.BENEFITSI_COMMERCE_ENABLED = "true";
    rights.role = "scanner";
    assert.doesNotMatch(
      render(h(PartnerDashboard, props)),
      /href="\/partner\/commerce"/,
    );
  } finally {
    if (old === undefined) delete process.env.BENEFITSI_COMMERCE_ENABLED;
    else process.env.BENEFITSI_COMMERCE_ENABLED = old;
  }
});
test("chart ticks and dates use CSS-sized HTML labels outside the scaled graphic", () => {
  const { VisitChart } = loadUi("components/partner/partner-charts.tsx");
  const series = {
    status: "ok",
    buckets: [
      { start: "2026-09-21T00:00:00+02:00", visits: 24 },
      { start: "2026-09-27T00:00:00+02:00", visits: 60 },
    ],
  };
  const doc = new JSDOM(render(h(VisitChart, { series }))).window.document;
  assert.equal(doc.querySelectorAll("svg text").length, 0);
  assert.match(
    doc.querySelector('[aria-label="Achse: Besuche"]').className,
    /text-xs/,
  );
  const range = doc.querySelector('[aria-label="Zeitraum der Besuchswerte"]');
  assert.match(range.className, /text-xs/);
  assert.match(range.textContent, /21.09.2026/);
  assert.match(range.textContent, /27.09.2026/);
  assert.equal(doc.querySelectorAll("tbody tr").length, 2);
});

test('an explicit restricted series bucket rejects the chart rather than drawing stale counts',()=>{
  assert.deepEqual(chartBuckets({status:'ok',buckets:[{start:'2026-10-01T00:00:00Z',status:'suppressed',visits:123456}]}),[])
})

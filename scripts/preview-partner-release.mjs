// Actual components, original brand/fonts, synthetic aggregates. Offline, unhydrated SSR only.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createElement as h } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { JSDOM, VirtualConsole } from "jsdom";
import { loadPreview } from "./partner-preview-loader.mjs";
const require = createRequire(import.meta.url);
const out = resolve(process.argv[2] ?? "/private/tmp/task9-partner-preview");
await mkdir(out, { recursive: true });
const fixture = JSON.parse(
  await readFile("tests/fixtures/partner-dashboard/release-v1.json", "utf8"),
);
Object.assign(
  fixture.scenarios,
  JSON.parse(
    await readFile("tests/fixtures/partner-dashboard/visual-demo.json", "utf8"),
  ).scenarios,
);
const css = (
  await require("postcss")([require("@tailwindcss/postcss")()]).process(
    (await readFile("app/globals.css", "utf8")) +
      '\n@source "../components"; @source "../app";',
    { from: resolve("scripts/partner-preview.css") },
  )
).css;
for (const asset of [
  "benefitsi-logo-on-light.svg",
  "benefitsi-logo-on-dark.svg",
])
  await copyFile("public/" + asset, resolve(out, asset));
await copyFile(
  "app/fonts/Satoshi-Variable.woff2",
  resolve(out, "Satoshi-Variable.woff2"),
);
const { PartnerDashboard, PartnerOverview } = loadPreview(
  "components/partner/partner-dashboard.tsx",
);
const { PartnerStatisticsToolbar } = loadPreview(
  "components/partner/partner-statistics-toolbar.tsx",
);
const { PartnerStatistics } = loadPreview(
  "components/partner/partner-statistics.tsx",
);
const { PartnerPlanPanel, PartnerPlanSummary } = loadPreview(
  "components/partner/partner-plan-panel.tsx",
);
const { PartnerWorkspace } = loadPreview("app/partner-admin.tsx");
const { AdminLanguageProvider, translateValue } = loadPreview(
  "app/admin-language.tsx",
);
for (const [name, scenario] of Object.entries(fixture.scenarios)) {
  const id = scenario.billing.entitlements.partner_id;
  const partner = {
    id,
    name: "Café Morgenrot · Demo",
    city_name: "München",
    address: "Sonnenstraße 12",
    category: ["cafe"],
    type: "gastronomy",
    status: "active",
    description:
      "Synthetischer Beispielbetrieb für die lokale Gestaltungsprüfung.",
    is_active: true,
    stamp_target: 10,
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
  for (const section of [
    "overview",
    "statistics",
    "billing",
    "business",
    "deals",
    "admin",
  ]) {
    const label = h(
      "aside",
      {
        className:
          "border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950",
      },
      "SYNTHETISCHE BEISPIELDATEN · " +
        (name === "demo"
          ? "VISUAL-DEMO · frei erstellte 7-Tage-Beispieldaten"
          : fixture.fixture_version) +
        " · " +
        name +
        " · Lokale statische Vorschau. Navigation funktioniert; Formulare, Auswahl, Export und Speichern sind deaktiviert.",
      h(
        "a",
        { href: `${name}-admin.html`, className: "ml-3 underline" },
        "Admin-Tarif",
      ),
    );
    const body =
      section === "admin"
        ? h(PartnerPlanPanel, {
            partnerId: id,
            initialData: scenario.admin_panel,
          })
        : section === "billing"
          ? h(PartnerPlanSummary, { data: scenario.billing })
          : section === "statistics"
            ? h(
                "div",
                null,
                h(PartnerStatisticsToolbar, {
                  partnerId: id,
                  preset: name === "demo" ? "last7" : "last30",
                  advanced:
                    scenario.billing.entitlements.features[
                      "analytics.advanced"
                    ] === true,
                  exportable:
                    scenario.billing.entitlements.features[
                      "analytics.export"
                    ] === true,
                }),
                h(PartnerStatistics, { data: scenario.dashboard }),
              )
            : section === "overview"
              ? h(PartnerOverview, {
                  partnerId: id,
                  name: partner.name,
                  rights: scenario.billing.entitlements,
                  data: scenario.dashboard,
                })
              : h(PartnerWorkspace, {
                  partners: [partner],
                  cities: [],
                  owners: [],
                  initialMode: "view",
                  initialPartnerId: id,
                  initialSettingsTab: section === "deals" ? "deals" : "details",
                  initialView: "settings",
                  portalMode: true,
                  micrositeEditingEnabled: false,
                  adminAccess: false,
                });
    const content = render(
      h(
        AdminLanguageProvider,
        { initialLanguage: "de" },
        label,
        h(PartnerDashboard, {
          partnerId: id,
          name: partner.name,
          partners: [{ id, name: partner.name }],
          rights: scenario.billing.entitlements,
          active: section === "admin" ? "billing" : section,
          signOut: h(
            "button",
            { disabled: true, className: "text-sm text-slate-500" },
            "Abmelden",
          ),
          children: body,
        }),
      ),
    );
    const dom = new JSDOM(
      '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Benefitsi · Synthetische Partnervorschau</title><style>' +
        css +
        "@font-face{font-family:Satoshi;src:url(Satoshi-Variable.woff2);font-weight:300 900}body{--font-satoshi:Satoshi;font-family:Satoshi,sans-serif}button:disabled{cursor:not-allowed}svg{flex-shrink:0}</style></head><body>" +
        content +
        "</body></html>",
      { virtualConsole: new VirtualConsole() },
    );
    const walker = dom.window.document.createTreeWalker(
      dom.window.document.body,
      dom.window.NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (
        !node.parentElement?.closest(
          '[data-admin-i18n-ignore="true"],script,style',
        )
      )
        node.nodeValue = translateValue(node.nodeValue ?? "", "de");
    }
    for (const el of dom.window.document.querySelectorAll(
      "[alt],[aria-label],[placeholder],[title]",
    ))
      for (const attr of ["alt", "aria-label", "placeholder", "title"])
        if (el.hasAttribute(attr))
          el.setAttribute(attr, translateValue(el.getAttribute(attr), "de"));
    for (const el of dom.window.document.querySelectorAll(
      "button,input,select,textarea",
    ))
      el.setAttribute("disabled", "");
    for (const form of dom.window.document.querySelectorAll("form")) {
      form.removeAttribute("action");
      form.setAttribute("inert", "");
    }
    for (const a of dom.window.document.querySelectorAll("a")) {
      const href = a.getAttribute("href");
      if (href?.startsWith("/partner")) {
        const u = new URL(href, "https://preview.invalid");
        const target =
          u.pathname === "/partner/statistics"
            ? "statistics"
            : u.pathname === "/partner/billing"
              ? "billing"
              : u.pathname === "/partner"
                ? (u.searchParams.get("section") ?? "overview")
                : null;
        if (target) a.setAttribute("href", `${name}-${target}.html`);
        else {
          a.removeAttribute("href");
          a.setAttribute("aria-disabled", "true");
        }
      }
    }
    for (const img of dom.window.document.querySelectorAll("img")) {
      img.removeAttribute("srcset");
      if (img.alt === "Benefitsi") img.src = "benefitsi-logo-on-light.svg";
    }
    const html = dom.serialize();
    await writeFile(resolve(out, `${name}-${section}.html`), html);
    if (section === "statistics")
      await writeFile(resolve(out, `${name}.html`), html);
  }
}
await writeFile(
  resolve(out, "index.html"),
  '<!doctype html><meta charset="utf-8"><title>Benefitsi Partner Vorschau</title><h1>Lokale synthetische Vorschau</h1>' +
    Object.keys(fixture.scenarios)
      .map((name) => `<p><a href="${name}-overview.html">${name}</a></p>`)
      .join(""),
);
await writeFile(
  resolve(out, "README.md"),
  "Generated by node scripts/preview-partner-release.mjs OUTPUT. Actual React components, original brand SVG and Satoshi font. Synthetic release-v1 fixture. Navigation and native details work; unhydrated forms, editing, tabs and mutations are disabled. No live API, provider, authentication, or mobile runtime coverage. Business/deals are actual PartnerWorkspace initial views; editing flows need the authenticated application.\n",
);
console.log(out);

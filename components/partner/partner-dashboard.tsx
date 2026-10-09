import Link from "next/link";
import {
  AdminLanguageControl,
  AdminLanguageProvider,
} from "@/app/admin-language";
import { signOutPartner } from "@/app/partner/actions";
import { PartnerRefreshOnReturn } from "@/components/partner/partner-refresh-on-return";
import { BrandLogo } from "@/components/brand-logo";
import {
  House,
  Tag,
  ChartNoAxesColumnIncreasing,
  Store,
  Settings,
  Users,
  ChevronDown,
} from "lucide-react";
import { PartnerStatistics } from "@/components/partner/partner-statistics";
import type { Dashboard } from "@/lib/partners/analytics";
import type { ReactNode } from "react";
import type { Entitlements } from "@/lib/partners/entitlements";
import { canManageProfile } from "@/lib/partners/entitlements";
export function PartnerDashboard({
  partnerId,
  name,
  partners,
  rights,
  active,
  children,
  signOut,
  isAdmin = false,
  accountName,
}: {
  partnerId: string;
  name: string;
  partners: { id: string; name: string }[];
  rights: Entitlements;
  active: string;
  children: ReactNode;
  signOut?: ReactNode;
  isAdmin?: boolean;
  accountName?: string;
}) {
  const navigation = [
    ["overview", "Start", "/partner"],
    ["deals", "Vorteile", "/partner?section=deals"],
    ["statistics", "Statistik", "/partner/statistics"],
    ["crm", "Kundenbindung", "/partner/crm"],
    ["business", "Betrieb", "/partner?section=business"],
    ["billing", "Abo", "/partner/billing"],
  ].filter(
    ([key]) => !["deals", "business"].includes(key) || canManageProfile(rights),
  );
  const icons = {
    overview: House,
    deals: Tag,
    statistics: ChartNoAxesColumnIncreasing,
    business: Store,
    billing: Settings,
    crm: Users,
  };
  return (
    <AdminLanguageProvider initialLanguage="de">
      <main className="min-h-screen bg-[#f4f7fb] text-[#061829]">
        <PartnerRefreshOnReturn />
        <div className="border-b border-slate-200 bg-white">
          <header className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <a
              aria-label="Benefitsi Partnerbereich"
              href={`/partner?partner=${encodeURIComponent(partnerId)}`}
            >
              <BrandLogo priority className="h-auto w-[145px]" />
            </a>
            <div className="flex flex-wrap items-center gap-3">
              <details className="relative rounded-2xl border border-slate-200 px-4 py-2 text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <Store size={21} />
                  <span className="max-w-64 break-words font-semibold">
                    {name}
                    <small className="block font-normal text-slate-500">
                      {rights.role === "owner" ? "Inhaber" : "Team"} ·
                      Partnerbereich
                    </small>
                  </span>
                  <ChevronDown size={16} />
                </summary>
                <ul className="absolute right-0 z-20 mt-3 min-w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  {partners.map((p) => (
                    <li key={p.id}>
                      <a data-admin-i18n-ignore={Boolean(p.name)}
                        className="block rounded-lg p-3 hover:bg-sky-50"
                        href={`/partner?partner=${encodeURIComponent(p.id)}`}
                      >
                        {p.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
              <span className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900">
                {rights.plan_code === "pro" ? "Pro" : "Free"}
              </span>
              {accountName && (
                <span className="max-w-44 truncate text-sm text-slate-600">
                  {accountName}
                </span>
              )}
              {isAdmin && (
                <Link
                  href="/"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                >
                  Admin-Bereich
                </Link>
              )}
              {process.env.BENEFITSI_COMMERCE_ENABLED === "true" &&
                rights.features.commerce === true &&
                canManageProfile(rights) && (
                  <a
                    href="/partner/commerce"
                    className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800"
                  >
                    Bestellungen & Termine
                  </a>
                )}
              <AdminLanguageControl />
              {signOut ?? (
                <form action={signOutPartner}>
                  <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    Abmelden
                  </button>
                </form>
              )}
            </div>
          </header>
        </div>
        <div className="mx-auto max-w-[1480px] px-4 sm:px-8">
          <nav
            aria-label="Partnerbereiche"
            className="flex gap-2 overflow-x-auto border-b border-slate-200 pt-3"
          >
            {navigation.map(([key, label, path]) => {
              const Icon = icons[key as keyof typeof icons];
              return (
                <a
                  key={key}
                  href={`${path}${path.includes("?") ? "&" : "?"}partner=${encodeURIComponent(partnerId)}`}
                  aria-current={active === key ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 border-b-[3px] px-4 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-sky-600 ${active === key ? "border-[#118cff] text-[#0874d1]" : "border-transparent text-slate-600 hover:bg-white"}`}
                >
                  <Icon size={20} />
                  {label}
                </a>
              );
            })}
          </nav>
          <div className="min-w-0 py-7 sm:py-9">
            {children}
          </div>
        </div>
      </main>
    </AdminLanguageProvider>
  );
}

export function PartnerOverview({
  partnerId,
  name,
  rights,
  data,
}: {
  partnerId: string;
  name: string;
  rights: Entitlements;
  data?: Dashboard;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{name}</h1>
        <a className="text-sm font-semibold text-[#0874d1]" href={`/partner/statistics?partner=${partnerId}`}>Alle Statistiken ansehen →</a>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {canManageProfile(rights) && <>
          <a className="rounded-xl bg-[#118cff] px-4 py-3 text-sm font-semibold text-white" href={`/partner?section=deals&tab=deals&action=create&partner=${partnerId}`}>Angebot erstellen</a>
          <a className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" href={`/partner?section=business&tab=hours&partner=${partnerId}`}>Zeiten bearbeiten</a>
        </>}
        <a className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" href={`/partner/crm?partner=${partnerId}`}>Gäste zurückholen</a>
      </div>
      {data && <PartnerStatistics data={data} compact />}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold">Dein Auftritt bei Benefitsi</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {rights.plan_code === "free"
            ? "Free zeigt dein Standardprofil auf der Stadtseite."
            : "Pro ermöglicht eine eigene Microsite."}{" "}
          Basisprofil, Menü und Öffnungszeiten bearbeitest du unter Betrieb.
          Individuelles Layout und Veröffentlichung übernimmt das
          Benefitsi-Team.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-sky-700">
          {canManageProfile(rights) && (
            <>
              <a
                className="underline"
                href={`/partner?section=business&partner=${partnerId}`}
              >
                Betriebsdaten prüfen
              </a>
              <a
                className="underline"
                href={`/partner?section=deals&partner=${partnerId}`}
              >
                Vorteile verwalten
              </a>
            </>
          )}
          <a
            className="underline"
            href={`/partner/billing?partner=${partnerId}`}
          >
            Tarif & Module ansehen
          </a>
          <a className="underline" href={`/partner/crm?partner=${partnerId}`}>Kundenbindung ansehen</a>
        </div>
      </section>
      <section className="mt-4 rounded-2xl bg-[#061829] p-5 text-white">
        <h2 className="font-bold">Bereit für den nächsten Gast?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Öffne die Benefitsi App zum Scannen an der Kasse. Der Partnerbereich
          im Browser hilft dir bei Auswertung und Verwaltung.
        </p>
      </section>
    </>
  );
}

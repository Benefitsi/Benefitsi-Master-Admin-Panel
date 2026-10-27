import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { redirect } from "next/navigation"
import { benefitKindTerms, occasionTerms, retiredDealTerms } from "@/lib/deal-terms"

export const dynamic = "force-dynamic"

// Brand Guide 2.1 (October 2026). Kept short: the team needs the names,
// colors and rules while editing deals, not the full guide.
const slogans = [
  { audience: "Dachclaim", text: "Mehr entdecken. Mehr zurückkommen. Mehr profitieren." },
  { audience: "Nutzer (App, Website)", text: "Deine Stadt. Deine Vorteile." },
  { audience: "Partner (Vertrieb)", text: "Mehr Kunden. Mehr Stammkunden.", open: true },
  { audience: "Städteseite", text: "{Stadt} entdecken. Lokal profitieren." },
  { audience: "Partnerseite", text: "Deine Vorteile bei {Partner}." },
]

const terms = [
  { term: "Deal", meaning: "Ein Vorteil, den Nutzer auswählen und an der Kasse einlösen.", example: "„2 für 1 Döner“" },
  { term: "Stempel", meaning: "Gibt es bei jedem qualifizierten Kauf. Ein Deal selbst gibt keinen Stempel.", example: "„7 von 10 Stempeln“" },
  { term: "Bonusstempel", meaning: "Zusätzlicher Stempel, der automatisch gutgeschrieben wird.", example: "„+1 Stempel“" },
  { term: "Prämie", meaning: "Belohnung für ein erreichtes Stempelziel.", example: "„Gratis Döner bei 10 Stempeln“" },
  { term: "Anlass", meaning: "Wann oder warum ein Deal gilt. Kleines Label über dem Titel.", example: "„Erster Besuch“" },
  { term: "Premium", meaning: "Bezahlte Mitgliedschaft (6,99 € im Monat, 29,90 € im Jahr).", example: "nicht „Abo“" },
  { term: "Partner", meaning: "Teilnehmender lokaler Betrieb.", example: "nicht „Händler“" },
  { term: "Partnerseite", meaning: "Eigene Microsite eines Partners.", example: "nicht „Landingpage“" },
  { term: "Städteseite", meaning: "Seite einer Stadt mit Orten, Terminen und Partnern.", example: "benefitsi.de/stadt/annweiler" },
]

const writingRules = [
  "Nutzer: immer „du“. Partner: „Sie“, nach Absprache „du“. Im Partner-Dashboard ohne Anrede.",
  "„20% Rabatt“ ohne Leerzeichen. „2 für 1“ ausgeschrieben.",
  "Preise: „6,99 € im Monat“. Datum 26.10.2026, Uhrzeit 18:30 Uhr, Zeitraum 15 bis 17 Uhr.",
  "Buttons beginnen mit einem Verb, höchstens drei Wörter.",
  "Den Vorteil konkret nennen, nie nur den Anlass. Label höchstens drei Wörter plus Zeitangabe.",
  "Rot nur für Deal Drop. Gold nur für Premium, Prämien und Erfolge.",
  "Keine Ausrufezeichen-Ketten, keine Großbuchstaben-Wörter, keine Emojis in Systemtexten.",
]

function Swatch({ color, surface }: { color: string; surface: string }) {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      <span className="size-4 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} />
      <span className="size-4 rounded-full ring-1 ring-black/10" style={{ backgroundColor: surface }} />
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#dde2e8] bg-white p-5 shadow-[0_2px_8px_rgb(0_0_0/0.06)]">
      <h2 className="text-base font-black tracking-[-0.01em] text-[#061829]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default async function BrandTermsPage() {
  if (!getSupabaseConfig().isConfigured) redirect("/login")
  const { adminSession } = await requireAdmin()
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell adminName={adminName} title="Marke & Begriffe" subtitle="Brand Guide 2.1: Namen, Farben und Regeln für Deals">
      <div className="grid gap-5 xl:grid-cols-2" data-admin-i18n-ignore="true">
        <Section title="Vorteil-Art: was Nutzer bekommen">
          <ul className="grid gap-3 sm:grid-cols-2">
            {Object.values(benefitKindTerms).map((kind) => (
              <li key={kind.key} className="flex items-start gap-3 rounded-xl border border-[#dde2e8] p-3">
                <Swatch color={kind.color} surface={kind.surface} />
                <div>
                  <p className="font-bold text-[#0a0a0a]">{kind.label}</p>
                  <p className="text-sm text-[#5b6472]">{kind.description}</p>
                  <p className="mt-1 font-mono text-[11px] text-[#5b6472]">{kind.icon} · {kind.color}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Anlass: wann oder warum">
          <ul className="grid gap-3 sm:grid-cols-2">
            {Object.values(occasionTerms).map((occasion) => (
              <li key={occasion.key} className="flex items-start gap-3 rounded-xl border border-[#dde2e8] p-3">
                <Swatch color={occasion.color} surface={occasion.surface} />
                <div>
                  <p className="font-bold text-[#0a0a0a]">{occasion.userLabel}</p>
                  {occasion.partnerLabel !== occasion.userLabel ? (
                    <p className="text-sm text-[#5b6472]">Partner und Admin: {occasion.partnerLabel}</p>
                  ) : null}
                  <p className="text-sm text-[#5b6472]">{occasion.description}</p>
                  <p className="mt-1 font-mono text-[11px] text-[#5b6472]">
                    {occasion.icon}{occasion.personal ? " · Filter „Für dich“" : ""}{occasion.premiumOnly ? " · nur Premium" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Begriffe">
          <dl className="divide-y divide-[#dde2e8]">
            {terms.map((entry) => (
              <div key={entry.term} className="grid gap-1 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)]">
                <dt className="font-bold text-[#0a0a0a]">{entry.term}</dt>
                <dd className="text-sm text-[#5b6472]">{entry.meaning} <span className="text-[#0a0a0a]">{entry.example}</span></dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Nicht mehr verwenden">
          <ul className="divide-y divide-[#dde2e8]">
            {retiredDealTerms.map((entry) => (
              <li key={entry.term} className="grid gap-1 py-2 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
                <span className="font-semibold text-[#c8322f] line-through decoration-1">{entry.term}</span>
                <span className="text-[#5b6472]">{entry.replacement}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[#5b6472]">Diese Begriffe markiert auch das Deal-Formular, sobald sie im Titel oder Text auftauchen.</p>
        </Section>

        <Section title="Slogans">
          <dl className="divide-y divide-[#dde2e8]">
            {slogans.map((entry) => (
              <div key={entry.audience} className="grid gap-1 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
                <dt className="text-sm font-semibold text-[#5b6472]">{entry.audience}</dt>
                <dd className="font-bold text-[#0a0a0a]">
                  {entry.text}
                  {entry.open ? <span className="ml-2 rounded-full bg-[#f3f5f7] px-2 py-0.5 text-[11px] font-semibold text-[#b35c00]">noch offen</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Schreibregeln">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-[#0a0a0a]">
            {writingRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </Section>
      </div>
    </AdminShell>
  )
}

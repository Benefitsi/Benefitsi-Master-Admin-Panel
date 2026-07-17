import Link from "next/link"
import type {
  AnalyticsBreakdownTable,
  AnalyticsDataQuality,
  AnalyticsFilterOption,
  AnalyticsFreshnessSource,
  AnalyticsKpiCard,
  AnalyticsMetricDefinition,
  AnalyticsMetricUnit,
  AnalyticsSection,
  AnalyticsSectionKey,
  AnalyticsTimeSeries,
  BusinessAnalyticsFilters,
  BusinessAnalyticsPayloadV1,
} from "@/lib/analytics/contracts"
import { periodLabel } from "@/lib/analytics/filters"
import { formatAnalyticsValue } from "@/lib/analytics/normalize"

const SECTION_META: Record<
  AnalyticsSectionKey,
  { title: string; eyebrow: string; description: string }
> = {
  overview: {
    title: "Übersicht",
    eyebrow: "Business Health",
    description:
      "Die wichtigsten Outcomes und Guardrails für den aktuellen Steuerungszeitraum.",
  },
  acquisition: {
    title: "Akquisition & Marketing",
    eyebrow: "Wachstum",
    description:
      "Kanäle, Kampagnen, Attribution und Kosten bis zur wertstiftenden Aktivierung.",
  },
  product: {
    title: "Produkt & Funnel",
    eyebrow: "Nutzerreise",
    description:
      "Vom Signup über Time-to-Value und Deal-Nutzung bis zur bestätigten Redemption.",
  },
  retention: {
    title: "Retention & CLV",
    eyebrow: "Kundenwert",
    description:
      "Wiederkehr, Kohorten und realisierter Kundenwert; Prognosen bleiben klar als provisional markiert.",
  },
  revenueProfit: {
    title: "Umsatz & Profit",
    eyebrow: "Finanzen",
    description:
      "Cash Collections, periodengerechter Umsatz, Deckungsbeitrag und Operating Profit.",
  },
  partners: {
    title: "Partner",
    eyebrow: "Netzwerk",
    description:
      "Partneraktivität, bestätigte Redemptions, Wiederkehr und Konzentrationsrisiken.",
  },
  dataQuality: {
    title: "Datenqualität & Definitionen",
    eyebrow: "Vertrauen",
    description:
      "Quellenstatus, Aktualität, Caveats und versionierte Definitionen hinter jeder Zahl.",
  },
}

export function BusinessControlCenter({
  payload,
  canReadFinance,
}: {
  payload: BusinessAnalyticsPayloadV1
  canReadFinance: boolean
}) {
  const sectionKeys = (Object.keys(SECTION_META) as AnalyticsSectionKey[]).filter(
    (key) => canReadFinance || key !== "revenueProfit",
  )

  return (
    <div className="space-y-5">
      <AnalyticsFilterBar
        filters={payload.filters}
        options={payload.filterOptions}
      />

      <StatusBanner payload={payload} />

      <nav
        aria-label="Bereiche im Business Control Center"
        className="flex gap-2 overflow-x-auto rounded-2xl border border-[#061829]/10 bg-white p-2 shadow-[0_12px_36px_rgba(6,24,41,.04)]"
      >
        {sectionKeys.map((key) => (
          <a
            key={key}
            href={`#${key}`}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-[#526170] transition hover:bg-[#f3f8ff] hover:text-[#0b75d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"
          >
            {SECTION_META[key].title}
          </a>
        ))}
      </nav>

      {sectionKeys.map((key) => (
        <DashboardSection
          key={key}
          sectionKey={key}
          section={payload.sections[key]}
        >
          {key === "dataQuality" ? (
            <DataQualityDetails payload={payload} />
          ) : null}
        </DashboardSection>
      ))}
    </div>
  )
}

export function AnalyticsAccessState({
  state,
}: {
  state: "forbidden" | "setup_required" | "unavailable"
}) {
  const content = {
    forbidden: {
      kicker: "Zugriff geschützt",
      title: "Keine Analytics-Berechtigung",
      description:
        "Dein Konto ist als Admin angemeldet, besitzt aber nicht die separate Berechtigung business_analytics:read. Der Admin-Status allein schaltet keine Business- oder Finanzdaten frei.",
      action: "Berechtigung durch einen autorisierten Administrator zuweisen lassen.",
    },
    setup_required: {
      kicker: "Einrichtung ausstehend",
      title: "Business Control Center ist vorbereitet",
      description:
        "Die Analytics-RPCs oder Berechtigungstabellen sind in dieser Umgebung noch nicht verfügbar. Bis die kanonische Supabase-Migration angewendet wurde, werden bewusst keine Ersatzwerte angezeigt.",
      action:
        "Migration mit get_my_analytics_permissions_v1 und get_business_analytics_v1 anwenden.",
    },
    unavailable: {
      kicker: "Datenquelle nicht erreichbar",
      title: "Analytics sind vorübergehend nicht verfügbar",
      description:
        "Die geprüften Aggregate konnten nicht geladen werden. Es werden keine gecachten oder geratenen Zahlen als aktuell ausgegeben.",
      action: "Supabase-Verbindung und RPC-Status prüfen und anschließend neu laden.",
    },
  }[state]

  return (
    <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_20px_56px_rgba(6,24,41,.07)]">
      <div className="h-1.5 bg-[linear-gradient(90deg,#118cff,#17d4d7)]" />
      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_17rem] md:p-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0b75d9]">
            {content.kicker}
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.035em] text-[#061829]">
            {content.title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#526170]">
            {content.description}
          </p>
        </div>
        <div className="rounded-2xl border border-[#118cff]/15 bg-[#f3f8ff] p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0b75d9]">
            Nächster Schritt
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#18354d]">
            {content.action}
          </p>
        </div>
      </div>
    </section>
  )
}

function AnalyticsFilterBar({
  filters,
  options,
}: {
  filters: BusinessAnalyticsFilters
  options: BusinessAnalyticsPayloadV1["filterOptions"]
}) {
  return (
    <form
      action="/analytics"
      method="get"
      aria-label="Business Analytics filtern"
      className="rounded-2xl border border-[#061829]/10 bg-white p-4 shadow-[0_12px_36px_rgba(6,24,41,.04)]"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <FilterField label="Von">
            <input
              type="date"
              name="from"
              defaultValue={filters.dateFrom}
              max={filters.dateTo}
              className={filterControlClass}
            />
          </FilterField>
          <FilterField label="Bis">
            <input
              type="date"
              name="to"
              defaultValue={filters.dateTo}
              className={filterControlClass}
            />
          </FilterField>
          <FilterField label="Stadt">
            <FilterSelect
              name="city"
              value={filters.cityId}
              options={options.cities}
              allLabel="Alle Städte"
            />
          </FilterField>
          <FilterField label="Partner">
            <FilterSelect
              name="partner"
              value={filters.partnerId}
              options={options.partners}
              allLabel="Alle Partner"
            />
          </FilterField>
          <FilterField label="Kanal">
            <FilterSelect
              name="channel"
              value={filters.channel}
              options={options.channels}
              allLabel="Alle Kanäle"
            />
          </FilterField>
          <FilterField label="Plan">
            <FilterSelect
              name="plan"
              value={filters.planCode}
              options={options.plans}
              allLabel="Alle Pläne"
            />
          </FilterField>
          <FilterField label="Umgebung">
            <select
              name="environment"
              defaultValue={filters.environment}
              className={filterControlClass}
            >
              <option value="production">Produktion</option>
              <option value="staging">Staging</option>
              <option value="test">Test</option>
            </select>
          </FilterField>
        </div>

        <div className="flex gap-2">
          <Link
            href="/analytics"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-3 text-sm font-bold text-[#526170] transition hover:bg-zinc-50"
          >
            Zurücksetzen
          </Link>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#061829] px-4 text-sm font-black text-white transition hover:bg-[#0b2a45] active:scale-[.98]"
          >
            Anwenden
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-[#6b7784]">
        {periodLabel(filters)} · Zeitzone Europe/Berlin · Währung EUR
      </p>
    </form>
  )
}

function FilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-[#6b7784]">
        {label}
      </span>
      {children}
    </label>
  )
}

function FilterSelect({
  name,
  value,
  options,
  allLabel,
}: {
  name: string
  value: string | null
  options: AnalyticsFilterOption[]
  allLabel: string
}) {
  const includesCurrent = !value || options.some((option) => option.id === value)
  return (
    <select name={name} defaultValue={value ?? ""} className={filterControlClass}>
      <option value="">{allLabel}</option>
      {!includesCurrent && value ? <option value={value}>{value}</option> : null}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

const filterControlClass =
  "h-10 w-full min-w-0 rounded-xl border border-[#061829]/15 bg-white px-3 text-sm font-semibold text-[#18354d] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"

function StatusBanner({ payload }: { payload: BusinessAnalyticsPayloadV1 }) {
  const isStale = payload.freshness.status === "stale"
  const isPartial =
    payload.status === "partial" || payload.freshness.status === "partial"
  const isEmpty = payload.status === "empty"
  const isFresh = payload.freshness.status === "fresh"
  const qualities = Object.values(payload.sections).flatMap((section) => [
    ...section.kpis.map((item) => item.quality),
    ...section.series.map((item) => item.quality),
    ...section.tables.map((item) => item.quality),
  ])
  const isVerified =
    isFresh && qualities.length > 0 && qualities.every((quality) => quality === "verified")
  const tone = isStale
    ? "border-amber-200 bg-amber-50 text-amber-950"
    : isPartial
      ? "border-blue-200 bg-blue-50 text-blue-950"
      : isEmpty
        ? "border-zinc-200 bg-zinc-50 text-zinc-800"
        : isVerified
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-amber-200 bg-amber-50 text-amber-950"
  const label = isStale
    ? "Daten sind veraltet"
    : isPartial
      ? "Daten teilweise verfügbar"
      : isEmpty
        ? "Noch keine geprüften Daten"
        : isVerified
          ? "Geprüfte Daten verfügbar"
          : "Datenprüfung ausstehend"

  return (
    <section className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${tone}`}>
      <div>
        <p className="text-sm font-black">{label}</p>
        <p className="mt-1 text-xs leading-5 opacity-75">
          Fehlende Kennzahlen erscheinen als „Noch nicht messbar“ und niemals als künstliche Null.
        </p>
      </div>
      <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-xs">
        <div>
          <dt className="font-bold opacity-65">Berechnet</dt>
          <dd className="mt-0.5 font-black">{formatTimestamp(payload.generatedAt)}</dd>
        </div>
        <div>
          <dt className="font-bold opacity-65">Datenstand</dt>
          <dd className="mt-0.5 font-black">
            {payload.freshness.asOf
              ? formatTimestamp(payload.freshness.asOf)
              : "Nicht verfügbar"}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function DashboardSection({
  sectionKey,
  section,
  children,
}: {
  sectionKey: AnalyticsSectionKey
  section: AnalyticsSection
  children?: React.ReactNode
}) {
  const meta = SECTION_META[sectionKey]
  const hasContent =
    section.kpis.length > 0 || section.series.length > 0 || section.tables.length > 0

  return (
    <section
      id={sectionKey}
      className="scroll-mt-5 rounded-3xl border border-[#061829]/10 bg-[#fbfbf8] p-4 shadow-[0_16px_48px_rgba(6,24,41,.04)] sm:p-5"
    >
      <header className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0b75d9]">
          {meta.eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[#061829]">
          {meta.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#526170]">{meta.description}</p>
      </header>

      {hasContent ? (
        <div className="mt-5 space-y-4">
          {section.kpis.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {section.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          ) : null}

          {section.series.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {section.series.map((series) => (
                <TimeSeriesCard key={series.key} series={series} />
              ))}
            </div>
          ) : null}

          {section.tables.map((table) => (
            <BreakdownTable key={table.key} table={table} />
          ))}
        </div>
      ) : (
        <EmptySection />
      )}

      {section.caveats.length > 0 ? (
        <CaveatList caveats={section.caveats} className="mt-4" />
      ) : null}
      {children}
    </section>
  )
}

function KpiCard({ kpi }: { kpi: AnalyticsKpiCard }) {
  const isMeasurable =
    kpi.availability !== "not_measurable" && kpi.value !== null
  const deltaLabel = formatDelta(kpi)

  return (
    <article className="flex min-h-72 flex-col rounded-2xl border border-[#061829]/10 bg-white p-4 shadow-[0_12px_30px_rgba(6,24,41,.035)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-black leading-5 text-[#18354d]">{kpi.label}</h3>
        <QualityBadge quality={kpi.quality} />
      </div>
      <p
        className={`mt-4 font-black tracking-[-0.045em] text-[#061829] ${
          isMeasurable ? "text-[2rem]" : "text-xl"
        }`}
      >
        {formatAnalyticsValue(kpi.value, kpi.unit, kpi.formattedValue)}
      </p>
      <p className="mt-1 min-h-5 text-xs font-bold text-[#526170]">
        {deltaLabel ?? "Vergleich noch nicht messbar"}
      </p>

      <dl className="mt-auto space-y-2 border-t border-[#061829]/8 pt-4 text-xs leading-5">
        <div>
          <dt className="font-black text-[#18354d]">Definition</dt>
          <dd className="mt-0.5 text-[#6b7784]">{kpi.definition}</dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="font-black text-[#18354d]">Quelle</dt>
            <dd className="mt-0.5 break-words text-[#6b7784]">{kpi.source}</dd>
          </div>
          <div>
            <dt className="font-black text-[#18354d]">Datenstand</dt>
            <dd className="mt-0.5 text-[#6b7784]">
              {kpi.asOf ? formatTimestamp(kpi.asOf) : "Nicht verfügbar"}
            </dd>
          </div>
        </div>
      </dl>
    </article>
  )
}

function TimeSeriesCard({ series }: { series: AnalyticsTimeSeries }) {
  const geometry = buildChartGeometry(series)
  return (
    <article className="rounded-2xl border border-[#061829]/10 bg-white p-4 shadow-[0_12px_30px_rgba(6,24,41,.035)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-[#18354d]">{series.title}</h3>
          {series.description ? (
            <p className="mt-1 text-xs leading-5 text-[#6b7784]">{series.description}</p>
          ) : null}
        </div>
        <QualityBadge quality={series.quality} />
      </div>

      {geometry ? (
        <div className="mt-4">
          <svg
            viewBox="0 0 640 220"
            role="img"
            aria-label={`${series.title} als Zeitreihe`}
            className="h-auto w-full overflow-visible"
          >
            <title>{series.title}</title>
            <desc>
              Zeitreihe mit aktuellem Zeitraum und, falls vorhanden, gestricheltem Vergleichszeitraum. Fehlende Werte werden nicht verbunden.
            </desc>
            {[32, 88, 144, 200].map((y) => (
              <line
                key={y}
                x1="36"
                x2="628"
                y1={y}
                y2={y}
                stroke="#dfe6eb"
                strokeWidth="1"
              />
            ))}
            {geometry.comparisonSegments.map((points, index) => (
              <polyline
                key={`comparison-${index}`}
                fill="none"
                stroke="#94a3b8"
                strokeDasharray="7 7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                points={points}
              />
            ))}
            {geometry.primarySegments.map((points, index) => (
              <polyline
                key={`primary-${index}`}
                fill="none"
                stroke="#118cff"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
                points={points}
              />
            ))}
            {geometry.dots.map((dot) => (
              <circle
                key={dot.key}
                cx={dot.x}
                cy={dot.y}
                r="4.5"
                fill="white"
                stroke="#118cff"
                strokeWidth="3"
              />
            ))}
          </svg>
          {geometry.comparisonSegments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-4 text-[11px] font-bold text-[#6b7784]" aria-hidden="true">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[#118cff]" />Aktueller Zeitraum</span>
              <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-slate-400" />Vergleichszeitraum</span>
            </div>
          ) : null}
          <table className="sr-only">
            <caption>{series.title}: zugängliche Werte der Zeitreihe</caption>
            <thead><tr><th>Datum</th><th>Aktuell</th><th>Vergleich</th></tr></thead>
            <tbody>
              {series.points.map((point, index) => (
                <tr key={`${point.date}-${point.label ?? ""}-${index}`}>
                  <th>{point.label ?? point.date}</th>
                  <td>{formatAnalyticsValue(point.value, series.unit)}</td>
                  <td>{formatAnalyticsValue(point.comparisonValue, series.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] font-bold text-[#6b7784]">
            <span>{geometry.firstLabel}</span>
            <span>
              {formatAnalyticsValue(geometry.min, series.unit)}–
              {formatAnalyticsValue(geometry.max, series.unit)}
            </span>
            <span>{geometry.lastLabel}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid min-h-48 place-items-center rounded-xl border border-dashed border-[#061829]/15 bg-zinc-50 px-4 text-center">
          <p className="text-sm font-bold text-[#6b7784]">Noch nicht messbar</p>
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#061829]/8 pt-3 text-xs text-[#6b7784]">
        <span>Quelle: {series.source}</span>
        <span>{series.asOf ? formatTimestamp(series.asOf) : "Stand fehlt"}</span>
      </footer>
    </article>
  )
}

function BreakdownTable({ table }: { table: AnalyticsBreakdownTable }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#061829]/10 bg-white shadow-[0_12px_30px_rgba(6,24,41,.035)]">
      <header className="flex flex-col gap-3 border-b border-[#061829]/8 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-black text-[#18354d]">{table.title}</h3>
          {table.description ? (
            <p className="mt-1 text-xs leading-5 text-[#6b7784]">{table.description}</p>
          ) : null}
        </div>
        <QualityBadge quality={table.quality} />
      </header>
      {table.rows.length > 0 && table.columns.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead className="bg-[#f7f8f8] text-xs uppercase tracking-[0.08em] text-[#6b7784]">
              <tr>
                <th className="px-4 py-3 font-black">Segment</th>
                {table.columns.map((column) => (
                  <th key={column.key} className="px-4 py-3 text-right font-black">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#061829]/8">
              {table.rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-[#f8fbff]">
                  <th className="px-4 py-3 font-bold text-[#18354d]">
                    <span className="flex items-center gap-2">
                      {row.label}
                      {row.quality ? <QualityBadge quality={row.quality} /> : null}
                    </span>
                  </th>
                  {table.columns.map((column) => (
                    <td
                      key={column.key}
                      className="px-4 py-3 text-right font-semibold tabular-nums text-[#526170]"
                    >
                      {formatTableValue(row.values[column.key], column.unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptySection compact />
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#061829]/8 px-4 py-3 text-xs text-[#6b7784]">
        <span>Quelle: {table.source}</span>
        <span>{table.asOf ? formatTimestamp(table.asOf) : "Stand fehlt"}</span>
      </footer>
    </article>
  )
}

function DataQualityDetails({ payload }: { payload: BusinessAnalyticsPayloadV1 }) {
  return (
    <div className="mt-5 space-y-4">
      <FreshnessTable sources={payload.freshness.sources} />
      <DefinitionsTable definitions={payload.definitions} />
      {payload.caveats.length > 0 ? <CaveatList caveats={payload.caveats} /> : null}
    </div>
  )
}

function FreshnessTable({ sources }: { sources: AnalyticsFreshnessSource[] }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#061829]/10 bg-white">
      <header className="border-b border-[#061829]/8 p-4">
        <h3 className="font-black text-[#18354d]">Source Freshness</h3>
        <p className="mt-1 text-xs text-[#6b7784]">
          Erwartete Aktualität: operativ bis 5 Minuten, Cockpit stündlich, Ads und CLV täglich.
        </p>
      </header>
      {sources.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="bg-[#f7f8f8] text-xs uppercase tracking-[0.08em] text-[#6b7784]">
              <tr>
                <th className="px-4 py-3 font-black">Quelle</th>
                <th className="px-4 py-3 font-black">Status</th>
                <th className="px-4 py-3 font-black">Datenstand</th>
                <th className="px-4 py-3 text-right font-black">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#061829]/8">
              {sources.map((source) => (
                <tr key={source.key}>
                  <th className="px-4 py-3 font-bold text-[#18354d]">{source.label}</th>
                  <td className="px-4 py-3"><FreshnessBadge status={source.status} /></td>
                  <td className="px-4 py-3 text-[#526170]">
                    {source.asOf ? formatTimestamp(source.asOf) : "Nicht verfügbar"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#526170]">
                    {source.expectedWithinMinutes === null
                      ? "—"
                      : formatSla(source.expectedWithinMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptySection compact />
      )}
    </article>
  )
}

function DefinitionsTable({ definitions }: { definitions: AnalyticsMetricDefinition[] }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#061829]/10 bg-white">
      <header className="border-b border-[#061829]/8 p-4">
        <h3 className="font-black text-[#18354d]">Metric Registry</h3>
        <p className="mt-1 text-xs text-[#6b7784]">
          Verbindliche, versionierte Definitionen für Karten, Charts und Exporte.
        </p>
      </header>
      {definitions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead className="bg-[#f7f8f8] text-xs uppercase tracking-[0.08em] text-[#6b7784]">
              <tr>
                <th className="px-4 py-3 font-black">Kennzahl</th>
                <th className="px-4 py-3 font-black">Formel</th>
                <th className="px-4 py-3 font-black">Grain / Quelle</th>
                <th className="px-4 py-3 font-black">Owner / SLA</th>
                <th className="px-4 py-3 font-black">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#061829]/8 align-top">
              {definitions.map((definition) => (
                <tr key={`${definition.key}-${definition.version}`}>
                  <th className="px-4 py-3 font-bold text-[#18354d]">
                    {definition.label}
                    <span className="mt-1 block font-mono text-[11px] font-medium text-[#6b7784]">
                      {definition.key}
                    </span>
                  </th>
                  <td className="max-w-sm px-4 py-3 leading-6 text-[#526170]">
                    {definition.formula}
                  </td>
                  <td className="px-4 py-3 leading-6 text-[#526170]">
                    {definition.grain}
                    <span className="block text-xs text-[#6b7784]">{definition.source}</span>
                  </td>
                  <td className="px-4 py-3 leading-6 text-[#526170]">
                    {definition.owner}
                    <span className="block text-xs text-[#6b7784]">{definition.freshnessSla}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[#526170]">
                    {definition.version}
                    {definition.target ? (
                      <span className="mt-1 block font-sans font-medium text-[#6b7784]">
                        Ziel: {definition.target}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptySection compact />
      )}
    </article>
  )
}

function EmptySection({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`grid place-items-center rounded-2xl border border-dashed border-[#061829]/15 bg-white px-5 text-center ${
        compact ? "m-4 min-h-28" : "mt-5 min-h-40"
      }`}
    >
      <div>
        <p className="font-black text-[#18354d]">Noch nicht messbar</p>
        <p className="mt-1 text-sm leading-6 text-[#6b7784]">
          Für diesen Filter liegen noch keine geprüften Aggregate vor.
        </p>
      </div>
    </div>
  )
}

function CaveatList({ caveats, className = "" }: { caveats: string[]; className?: string }) {
  return (
    <aside className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 ${className}`}>
      <h3 className="text-sm font-black text-amber-950">Hinweise zur Interpretation</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-900">
        {caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
      </ul>
    </aside>
  )
}

function QualityBadge({ quality }: { quality: AnalyticsDataQuality }) {
  const label: Record<AnalyticsDataQuality, string> = {
    verified: "Geprüft",
    estimated: "Geschätzt",
    provisional: "Provisional",
    partial: "Teilweise",
    unverified: "Ungeprüft",
    missing: "Fehlt",
  }
  const tone: Record<AnalyticsDataQuality, string> = {
    verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    estimated: "bg-blue-50 text-blue-700 ring-blue-200",
    provisional: "bg-violet-50 text-violet-700 ring-violet-200",
    partial: "bg-amber-50 text-amber-800 ring-amber-200",
    unverified: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    missing: "bg-rose-50 text-rose-700 ring-rose-200",
  }
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ring-inset ${tone[quality]}`}>
      {label[quality]}
    </span>
  )
}

function FreshnessBadge({ status }: { status: AnalyticsFreshnessSource["status"] }) {
  const labels = { fresh: "Aktuell", stale: "Veraltet", missing: "Fehlt", partial: "Teilweise" }
  const tones = {
    fresh: "bg-emerald-50 text-emerald-700",
    stale: "bg-amber-50 text-amber-800",
    missing: "bg-rose-50 text-rose-700",
    partial: "bg-blue-50 text-blue-700",
  }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${tones[status]}`}>{labels[status]}</span>
}

function formatDelta(kpi: AnalyticsKpiCard) {
  if (kpi.delta === null) return null
  const prefix = kpi.delta > 0 ? "+" : ""
  const delta = `${prefix}${formatAnalyticsValue(kpi.delta, kpi.deltaUnit)}`
  return `${delta} vs. vorheriger Zeitraum`
}

function formatTableValue(
  value: string | number | boolean | null,
  unit: AnalyticsMetricUnit,
) {
  if (typeof value === "number") return formatAnalyticsValue(value, unit)
  if (typeof value === "boolean") return value ? "Ja" : "Nein"
  return value ?? "—"
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Nicht verfügbar"
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date)
}

function formatSla(minutes: number) {
  if (minutes < 60) return `${minutes} Min.`
  if (minutes < 1_440) return `${Math.round(minutes / 60)} Std.`
  return `${Math.round(minutes / 1_440)} Tag(e)`
}

function buildChartGeometry(series: AnalyticsTimeSeries) {
  const values = series.points.flatMap((point) =>
    [point.value, point.comparisonValue].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    ),
  )
  if (values.length === 0 || series.points.length === 0) return null
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = maxValue === minValue ? Math.max(Math.abs(maxValue) * 0.1, 1) : 0
  const min = minValue - padding
  const max = maxValue + padding
  const width = 592
  const height = 168
  const xAt = (index: number) =>
    36 + (series.points.length === 1 ? width / 2 : (index / (series.points.length - 1)) * width)
  const yAt = (value: number) => 32 + height - ((value - min) / (max - min || 1)) * height
  const lineSegments = (
    selector: (point: AnalyticsTimeSeries["points"][number]) => number | null,
  ) => {
    const segments: string[] = []
    let current: string[] = []
    series.points.forEach((point, index) => {
      const value = selector(point)
      if (value === null) {
        if (current.length > 0) segments.push(current.join(" "))
        current = []
        return
      }
      current.push(`${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`)
    })
    if (current.length > 0) segments.push(current.join(" "))
    return segments
  }
  const primary = series.points
    .map((point, index) => point.value === null ? null : { index, value: point.value })
    .filter((point): point is { index: number; value: number } => point !== null)

  return {
    primarySegments: lineSegments((point) => point.value),
    comparisonSegments: lineSegments((point) => point.comparisonValue),
    dots: primary.length === 0
      ? []
      : [primary[0], primary.at(-1)]
          .filter((point): point is { index: number; value: number } => Boolean(point))
          .filter((point, index, all) => index === 0 || point.index !== all[0].index)
          .map((point) => ({
            key: `${point.index}-${point.value}`,
            x: xAt(point.index),
            y: yAt(point.value),
          })),
    min,
    max,
    firstLabel: series.points[0].label ?? shortPointDate(series.points[0].date),
    lastLabel:
      series.points.at(-1)?.label ?? shortPointDate(series.points.at(-1)?.date ?? ""),
  }
}

function shortPointDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
      }).format(date)
}

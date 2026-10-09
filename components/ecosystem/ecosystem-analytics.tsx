"use client"

import { useAdminLocale } from "@/app/admin-language"
import { AdminDate } from "@/components/admin-format"
import { AdminAnalyticsValue } from "@/components/analytics/admin-analytics-value"
import { useId, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, ChartLineUp, DotsThree, LockSimple } from "@phosphor-icons/react"
import type { AnalyticsBreakdownTable, AnalyticsDataQuality, AnalyticsMetricUnit, AnalyticsSectionKey, AnalyticsTimeSeries } from "@/lib/analytics/contracts"
import { formatAnalyticsValue } from "@/lib/analytics/normalize"
import type { OverviewAnalytics, OverviewAnalyticsView } from "@/lib/ecosystem/analytics"
import shared from "./ecosystem.module.css"
import styles from "./ecosystem-analytics.module.css"

const qualityLabels: Record<AnalyticsDataQuality, string> = {
  verified: "Bestätigt", estimated: "Geschätzt", provisional: "Vorläufig",
  partial: "Teilweise", unverified: "Unbestätigt", missing: "Nicht messbar",
}
const freshnessLabels = { fresh: "Aktuell", stale: "Veraltet", missing: "Datenstand unbekannt", partial: "Teilweise verfügbar" }
const environmentLabels = { production: "Produktion", staging: "Staging", test: "Test" }

export function EcosystemActivity({ analytics }: { analytics: OverviewAnalytics }) {
  const [viewKey, setViewKey] = useState<AnalyticsSectionKey | null>(null)
  const [seriesKeys, setSeriesKeys] = useState<Partial<Record<AnalyticsSectionKey, string>>>({})
  const id = useId()
  const views = analytics.state === "forbidden" ? [] : analytics.views
  const view = views.find(item => item.key === viewKey) ?? firstView(views)
  const series = view?.series.find(item => item.key === seriesKeys[view.key])
    ?? view?.series.find(item => item.points.some(point => point.value !== null))
    ?? view?.series[0] ?? null
  const qualityNotice = analytics.freshness?.status === "missing" && view?.asOf
    ? "Quellenstand unvollständig"
    : analytics.freshness && analytics.freshness.status !== "fresh"
      ? freshnessLabels[analytics.freshness.status]
      : analytics.state === "partial" ? "Teilweise verfügbar" : null

  return <section className={`${shared.activityStage} ${styles.analytics}`} aria-labelledby={`${id}-heading`}>
    <div className={shared.stageHead}>
      <div><span className={shared.stageLabel}><ChartLineUp size={17} aria-hidden="true" /> ANALYTICS</span><h2 id={`${id}-heading`}>{view?.label ?? "Aktivität"}.</h2></div>
      <Link href="/analytics" prefetch={false} className={shared.stageLink}>Alle Analysen <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>

    {views.length > 0 ? <div className={styles.sections} role="group" aria-label="Analysebereich">
      {views.map(item => <button key={item.key} type="button" aria-pressed={item.key === view?.key} aria-controls={`${id}-content`} onClick={() => setViewKey(item.key)}>{item.label}</button>)}
    </div> : null}

    <div id={`${id}-content`} className={styles.content}>
      <div className={styles.kpis} role="group" aria-label="Kennzahlen">
        {view?.kpis.length ? view.kpis.slice(0, 3).map((metric, index) => <div key={metric.key} className={styles.kpi} data-primary={index === 0}>
          <strong>{metric.value === null ? "—" : <AdminAnalyticsValue value={metric.value} unit={metric.unit} formattedValue={metric.formattedValue} />}</strong>
          <span>{metric.label}</span>
          {metric.quality !== "verified" ? <small>{qualityLabels[metric.quality]}</small> : null}
        </div>) : <div className={styles.kpi} data-primary="true"><strong>—</strong><span>{emptyLabel(analytics.state, view)}</span></div>}
      </div>

      <div className={styles.chartRegion}>
        {view && view.series.length > 1 ? <div className={styles.chartControls}>
          <label htmlFor={`${id}-metric`}>Trend</label>
          <select id={`${id}-metric`} aria-label="Diagramm-Kennzahl" value={series?.key ?? ""} onChange={event => setSeriesKeys(current => ({ ...current, [view.key]: event.target.value }))}>
            {view.series.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}
          </select>
        </div> : null}
        {series ? <ActivityChart series={series} /> : <div className={styles.emptyChart}>
          <div aria-hidden="true" />
          {analytics.state === "forbidden" ? <LockSimple size={42} weight="light" aria-hidden="true" /> : <ChartLineUp size={44} weight="light" aria-hidden="true" />}
          <span>{analytics.state === "forbidden" ? "Keine Freigabe" : "Kein Zeitverlauf"}</span>
          {view?.tables.length ? <small>Auswertungen unter Details</small> : null}
        </div>}
      </div>
    </div>

    <div className={styles.footer}>
      <span>{qualityNotice ? <em>{qualityNotice} · </em> : null}{view?.asOf ? <>Datenstand {dateTime(view.asOf)}</> : "Kein bestätigter Datenstand"}</span>
      {view ? <details>
        <summary>Details <DotsThree size={18} aria-hidden="true" /></summary>
        <div className={styles.details}>
          {analytics.period ? <p>{environmentLabels[analytics.period.environment]} · <AdminDate value={analytics.period.dateFrom} options={{ dateStyle: "medium", timeZone: "UTC" }} /> – <AdminDate value={analytics.period.dateTo} options={{ dateStyle: "medium", timeZone: "UTC" }} /></p> : null}
          {series ? <SeriesDetails series={series} /> : null}
          {view.kpis.length ? <section><h3>Alle Kennzahlen</h3><div className={styles.tableWrap} role="region" aria-label="Kennzahlendetails" tabIndex={0}>
            <table><thead><tr><th scope="col">Kennzahl</th><th scope="col">Wert</th><th scope="col">Quelle & Datenstand</th><th scope="col">Qualität</th></tr></thead><tbody>{view.kpis.map(metric => <tr key={metric.key}>
              <th scope="row">{metric.label}{metric.definition ? <small>{metric.definition}</small> : null}</th>
              <td>{metric.value === null ? "Keine Daten" : <AdminAnalyticsValue value={metric.value} unit={metric.unit} formattedValue={metric.formattedValue} />}</td><td>{metric.source || "Quelle unbekannt"}<small>{dateTime(metric.asOf)}</small></td><td>{qualityLabels[metric.quality]}</td>
            </tr>)}</tbody></table>
          </div></section> : null}
          {view.tables.map(table => <BreakdownDetails key={table.key} table={table} />)}
          {analytics.freshness?.sources.length ? <section><h3>Datenquellen</h3><ul className={styles.sources}>{analytics.freshness.sources.map(source => <li key={source.key}><span>{source.label}</span><span>{freshnessLabels[source.status]} · {dateTime(source.asOf)}</span></li>)}</ul></section> : null}
          {view.caveats.length ? <section><h3>Hinweise</h3>{view.caveats.map((note, index) => <p key={index}>{note}</p>)}</section> : null}
        </div>
      </details> : null}
    </div>
  </section>
}

function firstView(views: OverviewAnalyticsView[]) {
  return views.find(view => view.series.some(series => series.points.some(point => point.value !== null)))
    ?? views.find(view => view.kpis.length || view.series.length || view.tables.length) ?? views[0]
}

function emptyLabel(state: OverviewAnalytics["state"], view: OverviewAnalyticsView | undefined) {
  if (state === "forbidden") return "Analytics-Zugriff fehlt"
  if (state === "unavailable") return "Analytics derzeit nicht verfügbar"
  if (state === "setup_required") return "Analytics noch nicht eingerichtet"
  return view?.tables.length || view?.series.length ? "Keine Kennzahlen verfügbar" : "Keine Messwerte"
}

function ActivityChart({ series }: { series: AnalyticsTimeSeries }) {
  const locale = useAdminLocale()
  const id = useId()
  const finite = series.points.flatMap(point => point.value !== null && Number.isFinite(point.value) ? [point.value] : [])
  if (!finite.length) return <div className={styles.emptyChart}><ChartLineUp size={44} weight="light" aria-hidden="true" /><span>Noch keine Messwerte im Verlauf</span></div>

  // Normalize before calculating the range so even large finite values stay finite in SVG.
  const magnitude = Math.max(1, ...finite.map(value => Math.abs(value)))
  const normalized = finite.map(value => value / magnitude)
  const min = Math.min(0, ...normalized), measuredMax = Math.max(0, ...normalized)
  const max = measuredMax === min ? measuredMax + 1 : measuredMax
  const spread = max - min
  const dates = series.points.map(point => Date.parse(point.date))
  const dateAxis = dates.every(Number.isFinite)
  const start = dateAxis ? Math.min(...dates) : 0
  const duration = dateAxis ? Math.max(...dates) - start : 0
  const x = (index: number) => series.points.length === 1 ? 401
    : dateAxis && duration > 0 ? 54 + (dates[index] - start) / duration * 694
      : 54 + index / Math.max(1, series.points.length - 1) * 694
  const y = (value: number) => 170 - (value / magnitude - min) / spread * 142
  const segments: { line: string; firstX: number; lastX: number }[] = []
  let segment: typeof segments[number] | null = null
  series.points.forEach((point, index) => {
    if (point.value === null || !Number.isFinite(point.value)) { segment = null; return }
    const left = x(index)
    if (!segment) {
      segment = { line: `M${left},${y(point.value)}`, firstX: left, lastX: left }
      segments.push(segment)
    } else { segment.line += ` L${left},${y(point.value)}`; segment.lastX = left }
  })

  return <figure className={styles.chart}>
    <figcaption><span>{series.title}</span><span>{qualityLabels[series.quality]}</span></figcaption>
    <svg viewBox="0 0 772 210" role="img" aria-label={`${series.title}, ${series.points.length} Zeitpunkte. Fehlende Daten unterbrechen den Verlauf.`}>
      <defs>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#118CFF" /><stop offset="1" stopColor="#17D4D7" /></linearGradient>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#118CFF" stopOpacity=".27" /><stop offset="1" stopColor="#118CFF" stopOpacity="0" /></linearGradient>
      </defs>
      {[28, 99, 170].map(level => <line key={level} x1="54" x2="748" y1={level} y2={level} stroke="#FFFFFF" strokeOpacity=".09" strokeDasharray="3 7" />)}
      <text data-admin-i18n-ignore="true" x="0" y="32" fill="#91ADC4" fontSize="11">{axisValue(max * magnitude, series.unit, locale)}</text>
      <text data-admin-i18n-ignore="true" x="0" y="174" fill="#91ADC4" fontSize="11">{axisValue(min * magnitude, series.unit, locale)}</text>
      {segments.map((part, index) => <g key={index}>
        <path d={`${part.line} L${part.lastX},170 L${part.firstX},170 Z`} fill={`url(#${id}-area)`} />
        <path d={part.line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>)}
      {series.points.map((point, index) => point.value !== null && Number.isFinite(point.value) ? <circle key={index} cx={x(index)} cy={y(point.value)} r="3" fill="#17D4D7"><title data-admin-i18n-ignore="true">{`${point.label ?? dateLabel(point.date, locale)}: ${formatAnalyticsValue(point.value, series.unit, null, locale)}`}</title></circle> : null)}
      <text data-admin-i18n-ignore="true" x="54" y="201" fill="#9AAFC3" fontSize="12">{series.points[0]?.label ?? dateLabel(series.points[0]?.date, locale)}</text>
      <text data-admin-i18n-ignore="true" x="748" y="201" textAnchor="end" fill="#9AAFC3" fontSize="12">{series.points.at(-1)?.label ?? dateLabel(series.points.at(-1)?.date, locale)}</text>
    </svg>
  </figure>
}

function SeriesDetails({ series }: { series: AnalyticsTimeSeries }) {
  const locale = useAdminLocale()
  const comparison = series.points.some(point => point.comparisonValue !== null)
  return <section><h3>{series.title}</h3><p>{qualityLabels[series.quality]} · Quelle: {series.source || "Unbekannt"} · {dateTime(series.asOf)}</p>
    {series.description ? <p>{series.description}</p> : null}
    <div className={styles.tableWrap} role="region" aria-label="Zeitreihendaten" tabIndex={0}>
      <table aria-label={series.title}><thead><tr><th scope="col">Zeitpunkt</th><th scope="col">Wert</th>{comparison ? <th scope="col">Vergleichswert</th> : null}</tr></thead><tbody>{series.points.map((point, index) => <tr key={index}>
        <th scope="row">{point.label ?? <span data-admin-i18n-ignore="true">{dateLabel(point.date, locale)}</span>}</th><td>{point.value === null ? "Keine Daten" : <AdminAnalyticsValue value={point.value} unit={series.unit} />}</td>
        {comparison ? <td>{point.comparisonValue === null ? "Keine Daten" : <AdminAnalyticsValue value={point.comparisonValue} unit={series.unit} />}</td> : null}
      </tr>)}</tbody></table>
    </div>
  </section>
}

function BreakdownDetails({ table }: { table: AnalyticsBreakdownTable }) {
  return <section><h3>{table.title}</h3><p>{qualityLabels[table.quality]} · Quelle: {table.source || "Unbekannt"} · {dateTime(table.asOf)}</p>
    {table.description ? <p>{table.description}</p> : null}
    {table.rows.length ? <div className={styles.tableWrap} role="region" aria-label={table.title} tabIndex={0}>
      <table><thead><tr><th scope="col">Bereich</th>{table.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}<th scope="col">Qualität</th></tr></thead><tbody>{table.rows.map(row => <tr key={row.id}>
        <th scope="row">{row.label}</th>{table.columns.map(column => <td key={column.key}>{tableValue(row.values[column.key], column.unit)}</td>)}<td>{row.quality ? qualityLabels[row.quality] : "Nicht angegeben"}</td>
      </tr>)}</tbody></table>
    </div> : <p>Keine Daten</p>}
  </section>
}

function tableValue(value: string | number | boolean | null | undefined, unit: AnalyticsMetricUnit) {
  if (value === null || value === undefined) return "Keine Daten"
  if (typeof value === "number") return <AdminAnalyticsValue value={value} unit={unit} />
  if (typeof value === "boolean") return value ? "Ja" : "Nein"
  return value
}

function dateLabel(value: string | undefined, locale: string) {
  if (!value) return ""
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(date) : value
}

function dateTime(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? <AdminDate value={value} options={{ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }} />
    : "Kein bestätigter Datenstand"
}

function axisValue(value: number, unit: AnalyticsMetricUnit, locale: string) {
  const number = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)
  return unit === "currency_eur" ? `${number} €` : unit === "percent" || unit === "percentage_points" ? `${number} %` : number
}

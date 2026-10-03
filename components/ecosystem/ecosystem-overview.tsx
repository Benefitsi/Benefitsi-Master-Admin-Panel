import Link from "next/link"
import {
  ArrowRight, ArrowUpRight, ArrowsClockwise, Brain, ChartLineUp,
  Check, CheckCircle, Clock, Crown, DotsThree, FileText, GlobeHemisphereWest,
  MapPin, Robot, Scan, ShieldCheck, Sparkle, Stack, Storefront,
  Users, Warning, WarningCircle,
} from "@phosphor-icons/react/dist/ssr"
import type { AgentControlData } from "@/lib/agent-control-data"
import type { AnalyticsTimeSeries } from "@/lib/analytics/contracts"
import { formatAnalyticsValue } from "@/lib/analytics/normalize"
import type { FounderSnapshot } from "@/lib/founder-overview"
import { buildAgentSummaries, type AgentSummary, type OverviewAnalytics } from "@/lib/ecosystem/overview"
import { tierCatalog } from "@/lib/ecosystem/catalog"
import type { EcosystemPage } from "@/lib/ecosystem/directory"
import { EcosystemExplorer, PageDirectory } from "./ecosystem-explorer"
import styles from "./ecosystem.module.css"

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(value))
  : "Kein Nachweis"
const number = (value: number | null) => value === null ? "—" : value.toLocaleString("de-DE")
const qualityLabels: Record<string, string> = { verified: "Bestätigt", estimated: "Geschätzt", provisional: "Vorläufig", partial: "Teilweise", unverified: "Unbestätigt", missing: "Nicht verfügbar" }
const roleIcons: Record<string, typeof Robot> = {
  ben: Brain, "benefitsi-content": FileText, "benefitsi-seo": ChartLineUp,
  "city-annweiler": MapPin, "stamp-curator": Scan, studio: Sparkle, "benefitsi-menu": Storefront,
}
const shortRoles: Record<string, string> = {
  ben: "Koordination", "benefitsi-content": "Content", "benefitsi-seo": "Sichtbarkeit",
  "city-annweiler": "Stadtinhalte", "stamp-curator": "Entdeckerstempel", studio: "Design", "benefitsi-menu": "Menüimport",
}
const statusLabels = { ok: "Erfolgreich", attention: "Prüfen", stale: "Veraltet", unknown: "Ohne Laufdaten" }

export function EcosystemOverview({ snapshot, agentData, analytics, pages, incomplete }: {
  snapshot: FounderSnapshot
  agentData: AgentControlData
  analytics: OverviewAnalytics
  pages: EcosystemPage[]
  incomplete: boolean
}) {
  const agents = buildAgentSummaries(agentData)
  const benefitsiAgents = agents.filter(agent => agent.scope === "benefitsi")
  const otherAgents = agents.filter(agent => agent.scope !== "benefitsi")
  const observed = agentData.runtime.snapshot?.profiles.length ?? null
  const metrics = [
    { label: "Partner", value: snapshot.activePartners.unavailable ? null : snapshot.activePartners.value, note: "Aktive Profile", href: "/#partners", Icon: Storefront },
    { label: "Agents", value: observed, note: observed === null ? `${agents.length} konfiguriert` : agentData.runtime.state === "stale" ? "Beobachtung veraltet" : "Beobachtete Profile", href: "#agenten", Icon: Robot },
    { label: "Prüfungen", value: snapshot.pendingReviews.unavailable ? null : snapshot.pendingReviews.value, note: "Offene Freigaben", href: "/automation", Icon: ShieldCheck },
    { label: "Fehler", value: snapshot.failedJobs.unavailable ? null : snapshot.failedJobs.value, note: "Fehlgeschlagene Aufträge", href: "/automation", Icon: WarningCircle },
  ]
  return <div className={styles.overview} id="overview">
    <div className={styles.topline}>
      <span className={styles.overline}>ECOSYSTEM / ÜBERSICHT</span>
      <span className={styles.timestamp}><Clock size={13} aria-hidden="true" /> {dateTime(snapshot.checkedAt)} · Berlin</span>
    </div>

    <section className={styles.metrics} aria-label="Betriebskennzahlen" id="zahlen">
      {metrics.map(({ Icon, ...metric }, index) => <Link href={metric.href} key={metric.label} prefetch={false} className={styles.metric}>
        <div className={styles.metricTop}><span className={styles.metricIcon} data-accent={index === 3 && (metric.value ?? 0) > 0 ? "gold" : "blue"}><Icon size={23} weight="duotone" aria-hidden="true" /></span><ArrowUpRight size={17} aria-hidden="true" /></div>
        <div className={styles.metricValue}>{number(metric.value)}</div>
        <div className={styles.metricBottom}><h2>{metric.label}</h2><span>{metric.value === null && index !== 1 ? "Keine Daten" : metric.note}</span></div>
      </Link>)}
    </section>

    <div className={styles.commandGrid}>
      <section className={styles.activityStage} aria-labelledby="activity-heading">
        <div className={styles.stageHead}><div><span className={styles.stageLabel}><ChartLineUp size={17} aria-hidden="true" /> ANALYTICS</span><h2 id="activity-heading">Aktivität.</h2></div><Link href="/analytics" className={styles.stageLink}>30 Tage <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <div className={styles.stageKpis}>
          {analytics.kpis.length ? analytics.kpis.slice(0, 3).map((metric, index) => <div key={metric.key} className={index === 0 ? styles.primaryKpi : styles.secondaryKpi}><strong>{metric.formatted}</strong><span>{metric.label}</span>{metric.quality !== "verified" ? <small>{qualityLabels[metric.quality]}</small> : null}</div>) : <div className={styles.primaryKpi}><strong>—</strong><span>{analytics.state === "forbidden" ? "Analytics-Zugriff fehlt" : "Messwerte ausstehend"}</span></div>}
        </div>
        {analytics.series ? <ActivityChart series={analytics.series} /> : <div className={styles.chartEmpty} aria-label="Noch keine Messwerte"><div /><div /><div /><ChartLineUp size={44} weight="light" aria-hidden="true" /><span>Noch kein Verlauf</span></div>}
        <div className={styles.stageFooter}><span>{analytics.asOf ? `Datenstand ${dateTime(analytics.asOf)}` : "Kein bestätigter Datenstand"}</span><details><summary>Details <DotsThree size={18} aria-hidden="true" /></summary><div className={styles.stageDisclosure}><p>Produktion · letzte 30 Tage</p>{analytics.series ? <><p>{analytics.series.title} · {qualityLabels[analytics.series.quality]}</p><p>Quelle: {analytics.series.source}</p><div className={styles.chartTable}><table><thead><tr><th scope="col">Zeitpunkt</th><th scope="col">Wert</th></tr></thead><tbody>{analytics.series.points.map((point, index) => <tr key={index}><td>{point.label ?? point.date}</td><td>{point.value === null || !Number.isFinite(point.value) ? "Keine Daten" : formatAnalyticsValue(point.value, analytics.series!.unit)}</td></tr>)}</tbody></table></div></> : null}{analytics.caveats.map((note, index) => <p key={index}>{note}</p>)}</div></details></div>
      </section>

      <div className={styles.statusColumn}>
        <section className={`${styles.panel} ${styles.fleetPanel}`} aria-labelledby="fleet-heading"><div className={styles.cardHead}><h2 id="fleet-heading"><Robot size={20} weight="duotone" aria-hidden="true" /> Agent-Status</h2><a href="#agenten" aria-label="Zur Agentenübersicht"><ArrowUpRight size={18} aria-hidden="true" /></a></div><AgentRing agents={agents} /><span className={styles.smallCaption}>{agentData.runtime.state === "fresh" ? "Aktuelle Beobachtung" : agentData.runtime.state === "stale" ? "Beobachtung veraltet" : "Konfiguration · Laufdaten fehlen"}</span></section>
        <section className={`${styles.panel} ${styles.todoPanel}`} aria-labelledby="todo-heading"><div className={styles.cardHead}><h2 id="todo-heading"><Warning size={19} weight="duotone" aria-hidden="true" /> Dein Fokus</h2><Link href="/automation" aria-label="Aufträge öffnen"><ArrowUpRight size={18} aria-hidden="true" /></Link></div><FocusBars snapshot={snapshot} /></section>
      </div>
    </div>

    <section id="agenten" className={styles.agentSection} aria-labelledby="agents-heading">
      <div className={styles.sectionHead}><h2 id="agents-heading">Dein Team<span>.</span></h2><Link href="/agents" className={styles.textLink}>Alle Agents <ArrowRight size={16} aria-hidden="true" /></Link></div>
      <div className={styles.agentGrid}>{benefitsiAgents.map(agent => <AgentTile key={agent.id} agent={agent} />)}</div>
      {otherAgents.length ? <details className={styles.quietDisclosure}><summary>Weitere Profile <span>{otherAgents.length}</span></summary><div className={styles.agentGrid}>{otherAgents.map(agent => <AgentTile key={agent.id} agent={agent} />)}</div></details> : null}
    </section>

    <section id="tarife" className={styles.tiersSection} aria-labelledby="tiers-heading"><div className={styles.sectionHead}><h2 id="tiers-heading">Vier Zugänge<span>.</span></h2><span className={styles.smallCaption}>Nutzer & Partner</span></div><div className={styles.tierGrid}>{tierCatalog.map(tier => {
      const paid = tier.name === "Pro" || tier.name === "Premium"
      const Icon = tier.audience === "Partner" ? Storefront : Users
      return <details key={tier.id} className={styles.tierCard} data-premium={paid}>
        <summary><div className={styles.tierSymbol}><Icon size={30} weight="duotone" aria-hidden="true" />{paid ? <Crown size={14} weight="fill" aria-hidden="true" /> : null}</div><span className={styles.tierAudience}>{tier.audience}</span><h3>{tier.name}</h3><span className={styles.tierTeaser}>{tier.id === "consumer-free" ? "Entdecken & sammeln" : tier.id === "consumer-premium" ? "Mehr Vorteile · Testzugang" : tier.id === "partner-free" ? "Profil & Basisstatistik" : "Microsite & mehr"}</span><span className={styles.expandLink}>Umfang <span>+</span></span></summary>
        <div className={styles.tierContent}><p>{tier.description}</p><ul>{tier.features.map(feature => <li key={feature}><Check size={14} aria-hidden="true" />{feature}</li>)}</ul><p>{tier.note}</p><Link href={tier.href} prefetch={false}>Ansehen <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      </details>
    })}</div></section>

    <EcosystemExplorer />
    <PageDirectory pages={pages} incomplete={incomplete} />
    <nav className={styles.destinationDock} aria-label="Zentrale Zugänge"><a href="https://benefitsi.de" target="_blank" rel="noreferrer"><GlobeHemisphereWest size={22} weight="duotone" aria-hidden="true" /><span>Website</span><ArrowUpRight size={14} aria-hidden="true" /></a><a href="https://partner.benefitsi.de" target="_blank" rel="noreferrer"><Storefront size={22} weight="duotone" aria-hidden="true" /><span>Partner-Portal</span><ArrowUpRight size={14} aria-hidden="true" /></a><Link href="/wissen"><Stack size={22} weight="duotone" aria-hidden="true" /><span>Wissen</span><ArrowUpRight size={14} aria-hidden="true" /></Link><Link href="/system"><ArrowsClockwise size={22} weight="duotone" aria-hidden="true" /><span>System</span><ArrowUpRight size={14} aria-hidden="true" /></Link></nav>
  </div>
}

function AgentTile({ agent }: { agent: AgentSummary }) {
  const Icon = roleIcons[agent.id] ?? Robot
  return <details className={styles.agentTile} data-status={agent.status}>
    <summary><div className={styles.agentTileTop}><span className={styles.agentGlyph}><Icon size={28} weight="duotone" aria-hidden="true" /></span><span className={styles.agentStatusMark} title={agent.statusLabel}>{agent.status === "ok" ? <CheckCircle size={16} weight="fill" aria-hidden="true" /> : agent.status === "attention" ? <WarningCircle size={16} weight="fill" aria-hidden="true" /> : agent.status === "stale" ? <Clock size={16} aria-hidden="true" /> : <span aria-hidden="true">—</span>}</span></div><h3>{agent.name}</h3><p>{shortRoles[agent.id] ?? agent.scope}</p><span className={styles.agentStatus}>{statusLabels[agent.status]}</span><span className={styles.srOnly}>Details öffnen</span></summary>
    <div className={styles.agentExpanded}><p>{agent.purpose}</p><dl><div><dt>Modus</dt><dd>{agent.mode}</dd></div><div><dt>Rhythmus</dt><dd>{agent.cadence}</dd></div><div><dt>Letzter Lauf</dt><dd>{dateTime(agent.lastRunAt)}</dd></div></dl><Link href={agent.href} prefetch={false}>Verwalten <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
  </details>
}

function AgentRing({ agents }: { agents: AgentSummary[] }) {
  const groups = [
    { label: "Erfolgreich", count: agents.filter(item => item.status === "ok").length, color: "#118CFF" },
    { label: "Prüfen", count: agents.filter(item => item.status === "attention").length, color: "#FFB400" },
    { label: "Veraltet", count: agents.filter(item => item.status === "stale").length, color: "#17D4D7" },
    { label: "Unbekannt", count: agents.filter(item => item.status === "unknown").length, color: "#DDE4EC" },
  ]
  let offset = 0
  const circumference = 2 * Math.PI * 57
  return <div className={styles.fleetVisual}><div className={styles.ringWrap}><svg viewBox="0 0 144 144" role="img" aria-label={groups.map(item => `${item.count} ${item.label}`).join(", ")}><circle cx="72" cy="72" r="57" fill="none" stroke="#F3F5F7" strokeWidth="12" />{groups.filter(item => item.count).map(group => {
    const length = group.count / Math.max(1, agents.length) * circumference
    const start = offset; offset += length
    return <circle key={group.label} cx="72" cy="72" r="57" fill="none" stroke={group.color} strokeWidth="12" strokeDasharray={`${Math.max(0, length - (length === circumference ? 0 : 5))} ${circumference}`} strokeDashoffset={-start} transform="rotate(-90 72 72)" strokeLinecap="round" />
  })}</svg><div className={styles.ringLabel}><strong>{agents.length}</strong><span>Profile</span></div></div><div className={styles.ringLegend}>{groups.map(group => <div key={group.label}><span style={{ background: group.color }} /><span>{group.label}</span><strong>{group.count}</strong></div>)}</div></div>
}

function FocusBars({ snapshot }: { snapshot: FounderSnapshot }) {
  const rows = [
    { label: "Freigaben", value: snapshot.pendingReviews.unavailable ? null : snapshot.pendingReviews.value, href: "/automation", color: "#118CFF" },
    { label: "Fehler", value: snapshot.failedJobs.unavailable ? null : snapshot.failedJobs.value, href: "/automation", color: "#FFB400" },
    { label: "Fällige Quellen", value: snapshot.overdueSources.unavailable ? null : snapshot.overdueSources.value, href: "/city-operations", color: "#17D4D7" },
  ]
  const max = Math.max(1, ...rows.map(row => row.value ?? 0))
  return <div className={styles.focusBars}>{rows.map(row => <Link href={row.href} key={row.label} prefetch={false}><span>{row.label}</span><div className={styles.barTrack} aria-hidden="true">{row.value !== null ? <span style={{ width: `${row.value / max * 100}%`, background: row.color }} /> : null}</div><strong aria-label={`${row.label}: ${row.value === null ? "Keine Daten" : row.value}`}>{number(row.value)}</strong></Link>)}</div>
}

function ActivityChart({ series }: { series: AnalyticsTimeSeries }) {
  const finite = series.points.flatMap(point => point.value !== null && Number.isFinite(point.value) ? [point.value] : [])
  if (!finite.length) return <div className={styles.chartEmpty}><ChartLineUp size={44} aria-hidden="true" /><span>Noch kein Verlauf</span></div>
  const min = Math.min(0, ...finite), max = Math.max(1, ...finite), spread = max - min
  const x = (index: number) => 12 + index / Math.max(1, series.points.length - 1) * 736
  const y = (value: number) => 170 - (value - min) / spread * 147
  const segments: { line: string; firstX: number; lastX: number }[] = []
  let segment: typeof segments[number] | null = null
  series.points.forEach((point, index) => {
    if (point.value === null || !Number.isFinite(point.value)) { segment = null; return }
    const left = x(index)
    if (!segment) { segment = { line: `M${left},${y(point.value)}`, firstX: left, lastX: left }; segments.push(segment) }
    else { segment.line += ` L${left},${y(point.value)}`; segment.lastX = left }
  })
  return <figure className={styles.chart}><figcaption className={styles.chartCaption}><span>{series.title}</span><span>{qualityLabels[series.quality]}</span></figcaption><svg viewBox="0 0 772 207" role="img" aria-label={`${series.title}, ${series.points.length} Zeitpunkte. Fehlende Daten unterbrechen den Verlauf.`}>
    <defs><linearGradient id="ecosystem-line" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#118CFF" /><stop offset="1" stopColor="#17D4D7" /></linearGradient><linearGradient id="ecosystem-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#118CFF" stopOpacity=".25" /><stop offset="1" stopColor="#118CFF" stopOpacity="0" /></linearGradient></defs>
    {[28, 98, 170].map(level => <line key={level} x1="12" x2="748" y1={level} y2={level} stroke="#FFFFFF" strokeOpacity=".09" strokeDasharray="3 7" />)}
    {segments.map((part, index) => <g key={index}><path d={`${part.line} L${part.lastX},170 L${part.firstX},170 Z`} fill="url(#ecosystem-area)" /><path d={part.line} fill="none" stroke="url(#ecosystem-line)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></g>)}
    {series.points.map((point, index) => point.value !== null && Number.isFinite(point.value) ? <circle key={index} cx={x(index)} cy={y(point.value)} r="2.5" fill="#17D4D7"><title>{point.label ?? point.date}: {formatAnalyticsValue(point.value, series.unit)}</title></circle> : null)}
    <text x="12" y="200" fill="#9AAFC3" fontSize="12">{series.points[0]?.label ?? series.points[0]?.date}</text><text x="748" y="200" textAnchor="end" fill="#9AAFC3" fontSize="12">{series.points.at(-1)?.label ?? series.points.at(-1)?.date}</text>
  </svg></figure>
}

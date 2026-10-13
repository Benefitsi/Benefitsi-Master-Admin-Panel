import type { ReactNode } from "react"
import Link from "next/link"
import { AdminTranslationBoundary } from "@/components/admin-translation-boundary"
import {
  ArrowRight, ArrowUpRight, ArrowsClockwise, Brain, Calculator, ChartLineUp,
  CheckCircle, Clock, FileText, GlobeHemisphereWest, Info, Target,
  MapPin, Robot, ShieldCheck, Stack, Storefront,
  Warning, WarningCircle,
} from "@phosphor-icons/react/dist/ssr"
import type { BenefitsiKnowledgeStatus } from "@/lib/knowledge/read-projection"
import type { AgentControlData } from "@/lib/agent-control-data"
import { founderActions, type FounderSnapshot } from "@/lib/founder-overview"
import { benefitsiAgentInventory, buildAgentSummaries, type AgentSummary, type OverviewAnalytics } from "@/lib/ecosystem/overview"
import type { OverviewPriorities } from "@/lib/ecosystem/priorities"
import type { OverviewGoals } from "@/lib/ecosystem/analytics"
import { EcosystemActivity } from "./ecosystem-analytics"
export { EcosystemActivity } from "./ecosystem-analytics"
import { EcosystemProductHub } from "./ecosystem-product-hub"
import type { EcosystemPage } from "@/lib/ecosystem/directory"
import { PageDirectory } from "./ecosystem-explorer"
import styles from "./ecosystem.module.css"

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(value))
  : "Kein Nachweis"
const number = (value: number | null) => value === null ? "—" : value.toLocaleString("de-DE")
const roleIcons: Record<string, typeof Robot> = {
  ben: Brain, "benefitsi-content": FileText, "benefitsi-seo": ChartLineUp,
  "city-annweiler": MapPin, "benefitsi-menu": Storefront,
  "benefitsi-finance": Calculator,
}
const shortRoles: Record<string, string> = {
  ben: "Koordination", "benefitsi-content": "Redaktion", "benefitsi-seo": "Sichtbarkeit",
  "city-annweiler": "Stadtinhalte", "benefitsi-menu": "Menüimport",
  "benefitsi-finance": "Buchhaltung & Steuern",
}
const shortNames: Record<string, string> = { "benefitsi-content": "Content", "benefitsi-seo": "SEO", "city-annweiler": "Annweiler", "benefitsi-menu": "Menü", "benefitsi-finance": "Finanzen" }
const statusLabels = { ok: "Letzter Stand: OK", attention: "Prüfen", stale: "Alter Datenstand", unknown: "Status unbestätigt" }

export function EcosystemOverview({ snapshot, agentData, analytics, pages, incomplete }: {
  snapshot: FounderSnapshot
  agentData: AgentControlData
  analytics: OverviewAnalytics
  pages: EcosystemPage[]
  incomplete: boolean
}) {
  return <EcosystemOverviewLayout
    timestamp={<EcosystemTimestamp checkedAt={snapshot.checkedAt} />}
    metrics={<EcosystemMetrics snapshot={snapshot} agentData={agentData} />}
    activity={<EcosystemActivity analytics={analytics} />}
    focus={<EcosystemFocus snapshot={snapshot} />}
    directory={<PageDirectory pages={pages} incomplete={incomplete} />}
  />
}

export function EcosystemOverviewLayout({ timestamp, metrics, activity, focus, goals, knowledge, directory }: {
  timestamp: ReactNode
  metrics: ReactNode
  activity: ReactNode
  focus: ReactNode
  goals?: ReactNode
  knowledge?: ReactNode
  directory: ReactNode
}) {
  return <AdminTranslationBoundary><div className={styles.overview} id="overview">
    <div className={styles.topline}>
      <span className={styles.overline}>DEIN BETRIEB AUF EINEN BLICK</span>
      {timestamp}
    </div>

    {metrics}

    <div className={styles.commandGrid}>
      {activity}

      <div className={styles.statusColumn}>
        {focus}
        {goals}
      </div>
    </div>

    <EcosystemProductHub knowledge={knowledge} />
    {directory}
    <nav className={styles.destinationDock} aria-label="Zentrale Zugänge"><a href="https://benefitsi.de" target="_blank" rel="noreferrer"><GlobeHemisphereWest size={22} weight="duotone" aria-hidden="true" /><span>Website</span><ArrowUpRight size={14} aria-hidden="true" /></a><a href="https://partner.benefitsi.de" target="_blank" rel="noreferrer"><Storefront size={22} weight="duotone" aria-hidden="true" /><span>Partner-Portal</span><ArrowUpRight size={14} aria-hidden="true" /></a><Link href="/wissen"><Stack size={22} weight="duotone" aria-hidden="true" /><span>Wissen</span><ArrowUpRight size={14} aria-hidden="true" /></Link><Link href="/system"><ArrowsClockwise size={22} weight="duotone" aria-hidden="true" /><span>System</span><ArrowUpRight size={14} aria-hidden="true" /></Link></nav>
  </div></AdminTranslationBoundary>
}

export function EcosystemKnowledgeStatus({ status }: { status: BenefitsiKnowledgeStatus }) {
  const available = ["healthy", "syncing", "failed"].includes(status.status)
  const label = status.status === "healthy" ? "Synchronisiert" : status.status === "syncing" ? "Synchronisierung läuft" : status.status === "failed" ? "Fehler gemeldet" : status.status === "unavailable" ? "Daten fehlen" : "Status unbekannt"
  return <dl className={styles.knowledgeSummary}>
    <div><dt>Spiegelstatus</dt><dd>{label}</dd></div>
    <div><dt>Dokumente im Spiegel</dt><dd>{available ? number(status.documentCount) : "—"}</dd></div>
    <div><dt>Letzte erfolgreiche Synchronisierung</dt><dd>{dateTime(status.lastSuccessfulSyncAt)}</dd></div>
  </dl>
}

export function EcosystemTimestamp({ checkedAt }: { checkedAt: string }) {
  return <span className={styles.timestamp}><Clock size={13} aria-hidden="true" /> {dateTime(checkedAt)} · Berlin</span>
}

export function EcosystemMetrics({ snapshot, agentData }: { snapshot: FounderSnapshot; agentData: AgentControlData }) {
  const inventory = benefitsiAgentInventory(agentData)
  const metrics = [
    { label: "Partner", value: snapshot.activePartners.unavailable ? null : snapshot.activePartners.value, note: "Aktive Partnerprofile", href: "/partners", Icon: Storefront },
    { label: "Benefitsi-Profile", value: inventory.observedCount, note: inventory.state === "stale" ? `Veraltet · ${dateTime(inventory.observedAt)}` : inventory.observedAt ? `M1 · ${dateTime(inventory.observedAt)}` : "Laufzeitdaten fehlen", href: "/agents", Icon: Robot },
    { label: "Offene Freigaben", value: snapshot.pendingReviews.unavailable ? null : snapshot.pendingReviews.value, note: "Aufträge zur Prüfung", href: "/automation?status=needs_human", Icon: ShieldCheck },
    { label: "Fehlgeschlagen", value: snapshot.failedJobs.unavailable ? null : snapshot.failedJobs.value, note: "Aufträge", href: "/automation?status=failed", Icon: WarningCircle },
    { label: "Städte", value: null, note: "Stadtseiten verwalten", href: "/city-pages", Icon: MapPin, navigation: true },
    { label: "Microsites", value: null, note: "Partnerseiten verwalten", href: "/microsites", Icon: Storefront, navigation: true },
  ]
  return <section aria-label="Betriebskennzahlen" id="zahlen">
    <div className={styles.metrics}>{metrics.map(({ Icon, ...metric }, index) => <article className={styles.metric} key={metric.label}>
      <Link href={metric.href} prefetch={false} className={styles.metricLink}>
        <span className={styles.metricTop}><span className={styles.metricIcon} data-accent={index === 3 && (metric.value ?? 0) > 0 ? "gold" : "blue"}><Icon size={20} weight="duotone" aria-hidden="true" /></span><strong className={metric.navigation ? styles.metricAction : styles.metricValue}>{metric.navigation ? "Öffnen" : number(metric.value)}</strong></span>
        <h2>{metric.label}</h2><p>{!metric.navigation && metric.value === null && index !== 1 ? "Daten fehlen" : metric.note}</p>
      </Link>
    </article>)}</div>
    <p className={styles.metricCaption}>Beobachtete Profile sind kein Nachweis aktiver Läufe. Auftragsdaten: {dateTime(snapshot.checkedAt)}.</p>
  </section>
}

export function EcosystemFleet({ agentData }: { agentData: AgentControlData }) {
  const inventory = benefitsiAgentInventory(agentData)
  const agents = inventory.agents
  const observation = inventory.observedAt
  return <section className={`${styles.panel} ${styles.fleetPanel}`} aria-labelledby="fleet-heading">
    <div className={styles.cardHead}><h2 id="fleet-heading"><Robot size={20} weight="duotone" aria-hidden="true" /> Agent-Status</h2><Link href="/agents" prefetch={false} aria-label="Zur Agentenübersicht"><ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    <AgentRing agents={agents} />
    <details className={styles.evidenceDisclosure}><summary><Clock size={12} aria-hidden="true" />{inventory.state === "fresh" ? "Beobachtung aktuell" : inventory.state === "stale" ? "Beobachtung älter als 90 Min." : "Laufzeitdaten fehlen"}<Info size={13} aria-hidden="true" /></summary><div><p>Beobachtet: {dateTime(observation)}</p><p>Der Ring zeigt Benefitsi-Profile inklusive konfigurierter Rollen. Ein alter Datenstand beweist keinen aktuellen Ausfall. Letzte beobachtete Läufe stehen in den Agentendetails.</p></div></details>
  </section>
}

export function EcosystemPriorities({ data }: { data: OverviewPriorities }) {
  return <section className={`${styles.panel} ${styles.prioritiesPanel}`} aria-labelledby="priorities-heading">
    <div className={styles.cardHead}><h2 id="priorities-heading"><Target size={19} weight="duotone" aria-hidden="true" /> Nächste Schritte</h2></div>
    <ol className={styles.priorityList}>{data.items.map(item => <li key={item.id}><div><span>{item.source}</span><h3 data-admin-i18n-ignore={item.titleAuthored ? "true" : undefined}>{item.title}</h3><p data-admin-i18n-ignore={item.contextAuthored ? "true" : undefined}>{item.context}</p>{item.reference ? <small data-admin-i18n-ignore="true">{item.reference}</small> : null}{item.dueDate ? <small>Termin: {item.dueDate}</small> : null}</div><Link href={item.href} prefetch={false}>{item.action}<ArrowUpRight size={13} aria-hidden="true" /></Link></li>)}</ol>
    {!data.items.length ? <p className={styles.focusEmpty}>{data.complete ? "Keine offenen Aufgaben in den geprüften Quellen." : "Offene Aufgaben derzeit nicht vollständig nachgewiesen."}</p> : null}
    {data.unavailableSources.length ? <p className={styles.hubNote}>Quellen nicht verfügbar: {data.unavailableSources.map((source,index) => <span key={source}>{index ? " · " : ""}<span>{source}</span></span>)}</p> : null}
    {data.truncated ? <p className={styles.hubNote}>Auswahl der geladenen Aufgaben; weitere Einträge stehen in den jeweiligen Arbeitsbereichen.</p> : null}
    <p className={styles.metricCaption}>Abgefragt: {dateTime(data.checkedAt)}</p>
  </section>
}

export function EcosystemFocus({ snapshot }: { snapshot: FounderSnapshot }) {
  const actions = founderActions(snapshot).filter(action => action.id !== "partner-preparation")
  const titles: Record<string, string> = {
    "source-gap": "Datenverbindung prüfen", "failed-jobs": "Fehlerursachen prüfen", pipeline: "Stadtpipeline prüfen",
    "city-failed": "City-Lauf prüfen", reviews: "Freigaben bearbeiten", sources: "Stadtquellen prüfen", "city-freshness": "City-Nachweis prüfen",
  }
  return <section className={`${styles.panel} ${styles.todoPanel}`} aria-labelledby="todo-heading">
    <div className={styles.cardHead}><h2 id="todo-heading"><Warning size={19} weight="duotone" aria-hidden="true" /> Nächste Schritte</h2><Link href="/automation" aria-label="Aufträge öffnen"><ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    <div className={styles.actionList}>{actions.map(action => <details key={action.id} className={styles.actionItem}>
      <summary><span className={styles.actionDot} data-urgent={action.priority <= 1} /><span>{titles[action.id] ?? action.title}</span><span>+</span></summary>
      <div><p>{action.detail}</p><Link href={action.href} prefetch={false}>Öffnen <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
    </details>)}</div>
    {!actions.length ? <p className={styles.focusEmpty}>Kein offener Handlungsbedarf aus den geladenen Quellen.</p> : null}
  </section>
}

export function EcosystemGoals({ goals }: { goals: OverviewGoals }) {
  return <section id="ziele" className={`${styles.panel} ${styles.goalsPanel}`} aria-labelledby="goals-heading">
    <div className={styles.cardHead}><h2 id="goals-heading"><Target size={19} weight="duotone" aria-hidden="true" /> Ziele</h2><Link href="/analytics" aria-label="Kennzahlendefinitionen öffnen"><ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    {goals.items.length ? <div className={styles.goalList}>{goals.items.map(goal => <details key={goal.id}><summary><span>{goal.label} <small>· {goal.version}</small></span><strong>{goal.target}</strong></summary><p>Definition {goal.version} · Quelle: {goal.source || "Analytics-Kennzahlendefinition"}{goal.asOf ? ` · ${dateTime(goal.asOf)}` : " · Kein Ziel-Datenstand hinterlegt"}</p></details>)}</div>
      : <p className={styles.goalEmpty}>{goals.state === "forbidden" ? "Zielquelle nicht freigegeben." : goals.state === "empty" || goals.state === "ready" || goals.state === "partial" ? "Noch keine Zielwerte hinterlegt." : "Zielquelle derzeit nicht verfügbar."}</p>}
  </section>
}

export function EcosystemAgents({ agentData }: { agentData: AgentControlData }) {
  const agents = buildAgentSummaries(agentData)
  const benefitsiAgents = agents.filter(agent => agent.scope === "benefitsi")
  const otherAgents = agents.filter(agent => agent.scope !== "benefitsi")
  return <section id="agenten" className={styles.agentSection} aria-labelledby="agents-heading">
      <div className={styles.sectionHead}><h2 id="agents-heading">Dein Team<span>.</span></h2><Link href="/agents" className={styles.textLink}>Alle Agents <ArrowRight size={16} aria-hidden="true" /></Link></div>
      <div className={styles.agentGrid}>{benefitsiAgents.map(agent => <AgentTile key={agent.id} agent={agent} />)}</div>
      {otherAgents.length ? <details className={styles.quietDisclosure}><summary>Weitere Profile <span>{otherAgents.length}</span></summary><div className={styles.agentGrid}>{otherAgents.map(agent => <AgentTile key={agent.id} agent={agent} />)}</div></details> : null}
    </section>
}

export function EcosystemDirectory({ pages, incomplete }: { pages: EcosystemPage[]; incomplete: boolean }) {
  return <PageDirectory pages={pages} incomplete={incomplete} />
}

export function EcosystemSectionLoading({ label, variant = "panel" }: {
  label: string
  variant?: "metrics" | "activity" | "panel" | "agents" | "directory"
}) {
  if (variant === "metrics") return <section className={styles.metrics} aria-busy="true" aria-label={label}>
    <span className={styles.srOnly} role="status">{label}</span>
    {[0, 1, 2, 3, 4, 5].map(index => <div key={index} className={`${styles.metric} ${styles.loadingMetric}`} aria-hidden="true"><div className={styles.loadingBar} /><div className={styles.loadingBar} /></div>)}
  </section>
  return <section className={`${styles.loadingPanel} ${variant === "activity" ? styles.activityStage : styles.panel}`} data-variant={variant} aria-busy="true" aria-label={label}>
    <span role="status">{label}</span>
    <div className={styles.loadingBars} aria-hidden="true"><div className={styles.loadingBar} /><div className={styles.loadingBar} /><div className={styles.loadingBar} /></div>
  </section>
}

function AgentTile({ agent }: { agent: AgentSummary }) {
  const Icon = roleIcons[agent.id] ?? Robot
  return <details className={styles.agentTile} data-status={agent.status} data-agent={agent.id}>
    <summary>
      <span className={styles.agentGlyph}><Icon size={25} weight="duotone" aria-hidden="true" /></span>
      <div className={styles.agentIdentity}><h3 data-admin-i18n-ignore="true" title={agent.name}>{shortNames[agent.id] ?? agent.name}</h3><p>{shortRoles[agent.id] ?? agent.scope}</p></div>
      <span className={styles.agentStatusMark} title={agent.statusLabel}>{agent.status === "ok" ? <CheckCircle size={14} weight="fill" aria-hidden="true" /> : agent.status === "attention" ? <WarningCircle size={14} weight="fill" aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}</span>
      <span className={styles.agentStatus}>{agent.status === "unknown" && !agent.lastRunAt ? "Ohne Laufnachweis" : statusLabels[agent.status]}</span><span className={styles.srOnly}>Details öffnen</span>
    </summary>
    <div className={styles.agentExpanded}>
      <strong data-admin-i18n-ignore="true">{agent.name}</strong>
      <p>{agent.purpose}</p>
      <dl>
        <div><dt>Beobachtung</dt><dd>{dateTime(agent.observedAt)} · {agent.freshnessLabel}</dd></div>
        <div><dt>Letzter belegter Lauf</dt><dd>{agent.lastRunLabel}{agent.lastRunAt ? ` · ${dateTime(agent.lastRunAt)}` : ""}</dd></div>
        <div><dt>Arbeitsweise</dt><dd>{agent.mode} · {agent.cadence}</dd></div>
      </dl>
      <a href={agent.href}>Agent öffnen <ArrowUpRight size={13} aria-hidden="true" /></a>
    </div>
  </details>
}

function AgentRing({ agents }: { agents: AgentSummary[] }) {
  const groups = [
    { label: "Letzter Stand OK", count: agents.filter(item => item.status === "ok").length, color: "#118CFF" },
    { label: "Prüfen", count: agents.filter(item => item.status === "attention").length, color: "#FFB400" },
    { label: "Alter Datenstand", count: agents.filter(item => item.status === "stale").length, color: "#17D4D7" },
    { label: "Unbestätigt", count: agents.filter(item => item.status === "unknown").length, color: "#DDE4EC" },
  ]
  let offset = 0
  const circumference = 2 * Math.PI * 57
  return <div className={styles.fleetVisual}><div className={styles.ringWrap}><svg viewBox="0 0 144 144" role="img" aria-label={groups.map(item => `${item.count} ${item.label}`).join(", ")}><circle cx="72" cy="72" r="57" fill="none" stroke="#F3F5F7" strokeWidth="12" />{groups.filter(item => item.count).map(group => {
    const length = group.count / Math.max(1, agents.length) * circumference
    const start = offset; offset += length
    return <circle key={group.label} cx="72" cy="72" r="57" fill="none" stroke={group.color} strokeWidth="12" strokeDasharray={`${Math.max(0, length - (length === circumference ? 0 : 5))} ${circumference}`} strokeDashoffset={-start} transform="rotate(-90 72 72)" strokeLinecap="round" />
  })}</svg><div className={styles.ringLabel}><strong>{agents.length}</strong><span>Benefitsi</span></div></div><div className={styles.ringLegend}>{groups.map(group => <div key={group.label}><span style={{ background: group.color }} /><span>{group.label}</span><strong>{group.count}</strong></div>)}</div></div>
}

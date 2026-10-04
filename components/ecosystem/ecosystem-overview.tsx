import type { ReactNode } from "react"
import Link from "next/link"
import {
  ArrowRight, ArrowUpRight, ArrowsClockwise, Brain, ChartLineUp,
  Check, CheckCircle, Clock, Crown, FileText, GlobeHemisphereWest, Info, Target,
  MapPin, Robot, Scan, ShieldCheck, Sparkle, Stack, Storefront,
  Users, Warning, WarningCircle,
} from "@phosphor-icons/react/dist/ssr"
import type { AgentControlData } from "@/lib/agent-control-data"
import { founderActions, type FounderSnapshot } from "@/lib/founder-overview"
import { buildAgentSummaries, type AgentSummary, type OverviewAnalytics } from "@/lib/ecosystem/overview"
import type { OverviewGoals } from "@/lib/ecosystem/analytics"
import { EcosystemActivity } from "./ecosystem-analytics"
export { EcosystemActivity } from "./ecosystem-analytics"
import { tierCatalog } from "@/lib/ecosystem/catalog"
import type { EcosystemPage } from "@/lib/ecosystem/directory"
import { EcosystemExplorer, PageDirectory } from "./ecosystem-explorer"
import styles from "./ecosystem.module.css"

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(value))
  : "Kein Nachweis"
const number = (value: number | null) => value === null ? "—" : value.toLocaleString("de-DE")
const roleIcons: Record<string, typeof Robot> = {
  ben: Brain, "benefitsi-content": FileText, "benefitsi-seo": ChartLineUp,
  "city-annweiler": MapPin, "stamp-curator": Scan, studio: Sparkle, "benefitsi-menu": Storefront,
}
const shortRoles: Record<string, string> = {
  ben: "Koordination", "benefitsi-content": "Redaktion", "benefitsi-seo": "Sichtbarkeit",
  "city-annweiler": "Stadtinhalte", "stamp-curator": "Entdeckerstempel", studio: "Design", "benefitsi-menu": "Menüimport",
}
const shortNames: Record<string, string> = { "benefitsi-content": "Content", "benefitsi-seo": "SEO", "city-annweiler": "Annweiler", "stamp-curator": "Stempel", "benefitsi-menu": "Menü" }
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
    fleet={<EcosystemFleet agentData={agentData} />}
    focus={<EcosystemFocus snapshot={snapshot} />}
    agents={<EcosystemAgents agentData={agentData} />}
    directory={<PageDirectory pages={pages} incomplete={incomplete} />}
  />
}

export function EcosystemOverviewLayout({ timestamp, metrics, activity, fleet, focus, goals, agents, directory }: {
  timestamp: ReactNode
  metrics: ReactNode
  activity: ReactNode
  fleet: ReactNode
  focus: ReactNode
  goals?: ReactNode
  agents: ReactNode
  directory: ReactNode
}) {
  return <div className={styles.overview} id="overview">
    <div className={styles.topline}>
      <span className={styles.overline}>DEIN BETRIEB AUF EINEN BLICK</span>
      {timestamp}
    </div>

    {metrics}

    <div className={styles.commandGrid}>
      {activity}

      <div className={styles.statusColumn}>
        {fleet}
        {focus}
        {goals}
      </div>
    </div>

    {agents}

    <section id="tarife" className={styles.tiersSection} aria-labelledby="tiers-heading"><div className={styles.sectionHead}><h2 id="tiers-heading">Vier Zugänge<span>.</span></h2><span className={styles.smallCaption}>Nutzer & Partner</span></div><div className={styles.tierGrid}>{tierCatalog.map(tier => {
      const paid = tier.name === "Pro" || tier.name === "Premium"
      const Icon = tier.audience === "Partner" ? Storefront : Users
      return <details key={tier.id} className={styles.tierCard} data-premium={paid}>
        <summary><div className={styles.tierSymbol}><Icon size={24} weight="duotone" aria-hidden="true" />{paid ? <Crown size={14} weight="fill" aria-hidden="true" /> : null}</div><span className={styles.tierAudience}>{tier.audience}</span><h3>{tier.name}</h3><span className={styles.tierTeaser}>{tier.id === "consumer-free" ? "Entdecken & sammeln" : tier.id === "consumer-premium" ? "Mehr Vorteile · Testzugang" : tier.id === "partner-free" ? "Profil & Basisstatistik" : "Microsite & mehr"}</span><span className={styles.expandLink} aria-label="Umfang anzeigen"><span>+</span></span></summary>
        <div className={styles.tierContent}><p>{tier.description}</p><ul>{tier.features.map(feature => <li key={feature}><Check size={14} aria-hidden="true" />{feature}</li>)}</ul><p>{tier.note}</p><Link href={tier.href} prefetch={false}>Ansehen <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      </details>
    })}</div></section>

    <EcosystemExplorer />
    {directory}
    <nav className={styles.destinationDock} aria-label="Zentrale Zugänge"><a href="https://benefitsi.de" target="_blank" rel="noreferrer"><GlobeHemisphereWest size={22} weight="duotone" aria-hidden="true" /><span>Website</span><ArrowUpRight size={14} aria-hidden="true" /></a><a href="https://partner.benefitsi.de" target="_blank" rel="noreferrer"><Storefront size={22} weight="duotone" aria-hidden="true" /><span>Partner-Portal</span><ArrowUpRight size={14} aria-hidden="true" /></a><Link href="/wissen"><Stack size={22} weight="duotone" aria-hidden="true" /><span>Wissen</span><ArrowUpRight size={14} aria-hidden="true" /></Link><Link href="/system"><ArrowsClockwise size={22} weight="duotone" aria-hidden="true" /><span>System</span><ArrowUpRight size={14} aria-hidden="true" /></Link></nav>
  </div>
}

export function EcosystemTimestamp({ checkedAt }: { checkedAt: string }) {
  return <span className={styles.timestamp}><Clock size={13} aria-hidden="true" /> {dateTime(checkedAt)} · Berlin</span>
}

export function EcosystemMetrics({ snapshot, agentData }: { snapshot: FounderSnapshot; agentData: AgentControlData }) {
  const observed = agentData.runtime.snapshot?.profiles.length ?? null
  const metrics = [
    { label: "Partner", value: snapshot.activePartners.unavailable ? null : snapshot.activePartners.value, note: "Aktive Profile", source: "Partner mit Status active und is_active=true.", asOf: snapshot.checkedAt, href: "/partners", Icon: Storefront },
    { label: "Agents", value: observed, note: "Beobachtete Profile", source: `M1-Laufzeitbeobachtung. ${agentData.runtime.state === "stale" ? "Älter als 90 Minuten; kein aktueller Betriebsnachweis." : observed === null ? "Kein gültiger Laufzeitnachweis verfügbar." : "Zusätzlich konfigurierte Rollen stehen unter Dein Team."}`, asOf: agentData.runtime.snapshot?.observedAt ?? null, href: "#agenten", Icon: Robot },
    { label: "Prüfungen", value: snapshot.pendingReviews.unavailable ? null : snapshot.pendingReviews.value, note: "Offene Freigaben", source: "Aufträge mit Status needs_human.", asOf: snapshot.checkedAt, href: "/automation", Icon: ShieldCheck },
    { label: "Fehler", value: snapshot.failedJobs.unavailable ? null : snapshot.failedJobs.value, note: "Fehlgeschlagene Aufträge", source: "Aufträge mit Status failed. Dies ist kein Zähler aktuell ausgefallener Agenten.", asOf: snapshot.checkedAt, href: "/automation", Icon: WarningCircle },
  ]
  return <section className={styles.metrics} aria-label="Betriebskennzahlen" id="zahlen">
    {metrics.map(({ Icon, ...metric }, index) => <article className={styles.metric} key={metric.label}>
      <Link href={metric.href} prefetch={false} className={styles.metricLink}>
        <span className={styles.metricIcon} data-accent={index === 3 && (metric.value ?? 0) > 0 ? "gold" : "blue"}><Icon size={22} weight="duotone" aria-hidden="true" /></span>
        <div><strong className={styles.metricValue}>{number(metric.value)}</strong><h2>{metric.label}</h2></div>
      </Link>
      <details className={styles.metricDetail}><summary aria-label={`${metric.label}: Herkunft und Datenstand`}><Info size={16} aria-hidden="true" /></summary><div><strong>{metric.note}</strong><p>{metric.value === null ? "Keine Daten. " : ""}{metric.source}</p><p>Stand: {dateTime(metric.asOf)}</p></div></details>
    </article>)}
  </section>
}

export function EcosystemFleet({ agentData }: { agentData: AgentControlData }) {
  const agents = buildAgentSummaries(agentData).filter(agent => agent.scope === "benefitsi")
  const observation = agentData.runtime.snapshot?.observedAt ?? null
  return <section className={`${styles.panel} ${styles.fleetPanel}`} aria-labelledby="fleet-heading">
    <div className={styles.cardHead}><h2 id="fleet-heading"><Robot size={20} weight="duotone" aria-hidden="true" /> Agent-Status</h2><a href="#agenten" aria-label="Zur Agentenübersicht"><ArrowUpRight size={18} aria-hidden="true" /></a></div>
    <AgentRing agents={agents} />
    <details className={styles.evidenceDisclosure}><summary><Clock size={12} aria-hidden="true" />{agentData.runtime.state === "fresh" ? "Beobachtung aktuell" : agentData.runtime.state === "stale" ? "Beobachtung älter als 90 Min." : "Laufzeitdaten fehlen"}<Info size={13} aria-hidden="true" /></summary><div><p>Beobachtet: {dateTime(observation)}</p><p>Der Ring zeigt Benefitsi-Profile inklusive konfigurierter Rollen. Ein alter Datenstand beweist keinen aktuellen Ausfall. Letzte beobachtete Läufe stehen in den Agentendetails.</p></div></details>
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
    {[0, 1, 2, 3].map(index => <div key={index} className={`${styles.metric} ${styles.loadingMetric}`} aria-hidden="true"><div className={styles.loadingBar} /><div className={styles.loadingBar} /></div>)}
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
      <div className={styles.agentIdentity}><h3 title={agent.name}>{shortNames[agent.id] ?? agent.name}</h3><p>{shortRoles[agent.id] ?? agent.scope}</p></div>
      <span className={styles.agentStatusMark} title={agent.statusLabel}>{agent.status === "ok" ? <CheckCircle size={14} weight="fill" aria-hidden="true" /> : agent.status === "attention" ? <WarningCircle size={14} weight="fill" aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}</span>
      <span className={styles.agentStatus}>{agent.status === "unknown" && !agent.lastRunAt ? "Ohne Laufnachweis" : statusLabels[agent.status]}</span><span className={styles.srOnly}>Details öffnen</span>
    </summary>
    <div className={styles.agentExpanded}>
      <strong>{agent.name}</strong>
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

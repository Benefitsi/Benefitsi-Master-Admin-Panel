import Link from "next/link"
import { ArrowRight, ArrowUpRight, ChartLineUp, Check, GlobeHemisphereWest, Robot, Stack, WarningCircle } from "@phosphor-icons/react/dist/ssr"
import type { AgentControlData } from "@/lib/agent-control-data"
import type { AnalyticsTimeSeries } from "@/lib/analytics/contracts"
import { formatAnalyticsValue } from "@/lib/analytics/normalize"
import { founderActions, type FounderSnapshot } from "@/lib/founder-overview"
import { buildAgentSummaries, type OverviewAnalytics } from "@/lib/ecosystem/overview"
import { ecosystemCatalog, tierCatalog } from "@/lib/ecosystem/catalog"
import type { EcosystemPage } from "@/lib/ecosystem/directory"
import { EcosystemExplorer, PageDirectory } from "./ecosystem-explorer"
import styles from "./ecosystem.module.css"

const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(value))
  : "Nicht nachgewiesen"
const qualityLabels: Record<string, string> = { verified: "Bestätigt", estimated: "Geschätzt", provisional: "Vorläufig", partial: "Teilweise", unverified: "Unbestätigt", missing: "Nicht verfügbar" }

export function EcosystemOverview({ snapshot, agentData, analytics, pages, incomplete }: {
  snapshot: FounderSnapshot
  agentData: AgentControlData
  analytics: OverviewAnalytics
  pages: EcosystemPage[]
  incomplete: boolean
}) {
  const agents = buildAgentSummaries(agentData)
  const actions = founderActions(snapshot)
  const counts = [
    { label: "Aktive Partnerprofile", value: snapshot.activePartners.unavailable ? null : snapshot.activePartners.value, hint: "Freigeschaltete Profile", href: "/#partners" },
    { label: "Beobachtete Agenten", value: agentData.runtime.snapshot?.profiles.length ?? null, hint: agentData.runtime.state === "stale" ? "Beobachtung veraltet" : "Profile im letzten M1-Snapshot", href: "#agenten" },
    { label: "Offene Prüfungen", value: snapshot.pendingReviews.unavailable ? null : snapshot.pendingReviews.value, hint: "Aufträge mit Prüfbedarf", href: "/automation" },
    { label: "Fehlgeschlagene Aufträge", value: snapshot.failedJobs.unavailable ? null : snapshot.failedJobs.value, hint: "Aktueller Auftragsstatus", href: "/automation" },
  ]
  const benefitsiAgents = agents.filter(agent => agent.scope === "benefitsi")
  const otherAgents = agents.filter(agent => agent.scope !== "benefitsi")
  return <div className={styles.overview} id="overview">
    <section className={styles.hero} aria-labelledby="ecosystem-heading">
      <div className={styles.heroCopy}>
        <p className={styles.heroEyebrow}><span /> BENEFITSI ECOSYSTEM</p>
        <h2 id="ecosystem-heading">Das Ganze sehen.<br /><span>Das Nächste bewegen.</span></h2>
        <p>Deine Agents, dein Produkt, deine Plattform.<br className={styles.desktopBreak} /> Ein Überblick. Kurze Wege.</p>
        <div className={styles.heroActions}><a href="#agenten">Agents im Blick <ArrowRight size={16} aria-hidden="true" /></a><a href="#features">Alle Features entdecken</a></div>
      </div>
      <div className={styles.ecosystemMap} aria-label="Benefitsi verbindet App, Partner, Städte und Agenten">
        <div className={styles.mapTop}><Stack size={22} aria-hidden="true" /><span>App & Nutzer</span></div>
        <div className={styles.mapMiddle}><span>Partner</span><div className={styles.mapBrand}>benefitsi<span>.</span></div><span>Städte</span></div>
        <div className={styles.mapBottom}><Robot size={21} aria-hidden="true" /><span>Agents & Automationen</span></div>
        <p>{ecosystemCatalog.length} Produktbausteine · ein Ecosystem</p>
      </div>
    </section>

    <nav className={styles.sectionNav} aria-label="Dashboard-Bereiche"><a href="#zahlen">Kennzahlen</a><a href="#agenten">Agents</a><a href="#tarife">Nutzer & Partner</a><a href="#features">Features & Deals</a><a href="#seiten">Seiten & Links</a></nav>
    <section id="zahlen" aria-label="Betriebskennzahlen" className={styles.metrics}>
      {counts.map(metric => <Link href={metric.href} key={metric.label} prefetch={false}><div className={styles.metricLabel}>{metric.label}<ArrowUpRight size={16} aria-hidden="true" /></div><strong>{metric.value === null ? "—" : metric.value.toLocaleString("de-DE")}</strong><span>{metric.value === null ? "Quelle nicht verfügbar" : metric.hint}</span></Link>)}
    </section>
    <p className={styles.timestamp}>Betrieb abgefragt: {dateTime(snapshot.checkedAt)} Uhr · Berlin. Profile sind keine zahlenden Kunden oder laufenden Prozesse.</p>

    <div className={styles.analyticsGrid}>
      <section className={styles.panel} aria-labelledby="analytics-heading">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Nutzung & Entwicklung</p><h2 id="analytics-heading">Deine Zahlen im Verlauf</h2></div><Link href="/analytics" className={styles.textLink}>Analytics <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <div className={styles.analyticsMeta}><span>Letzte 30 Tage · Produktion</span><span>{analytics.asOf ? `Datenstand ${dateTime(analytics.asOf)}` : "Kein bestätigter Datenstand"}</span></div>
        {analytics.kpis.length ? <div className={styles.analyticsKpis}>{analytics.kpis.slice(0, 3).map(metric => <div key={metric.key}><span>{metric.label}</span><strong>{metric.formatted}</strong><small>{qualityLabels[metric.quality] ?? metric.quality}</small></div>)}</div> : null}
        {analytics.series ? <ActivityChart series={analytics.series} /> : <div className={styles.chartEmpty}><ChartLineUp size={34} weight="light" aria-hidden="true" /><h3>{analytics.state === "forbidden" ? "Analytics-Zugriff erforderlich" : "Noch kein belastbarer Verlauf"}</h3><p>{analytics.state === "forbidden" ? "Die Kennzahlen folgen den Analytics-Rechten deines Kontos." : "Sobald Messwerte verfügbar sind, erscheint hier die Entwicklung. Fehlende Daten bleiben offen."}</p><Link href="/analytics">Datenquellen ansehen <ArrowRight size={14} aria-hidden="true" /></Link></div>}
        {analytics.caveats.length ? <details className={styles.dataNotes}><summary>Datenhinweise ({analytics.caveats.length})</summary><ul>{analytics.caveats.map((note, index) => <li key={index}>{note}</li>)}</ul></details> : null}
      </section>
      <section className={`${styles.panel} ${styles.attentionPanel}`} aria-labelledby="attention-heading"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>Nächster Schritt</p><h2 id="attention-heading">Das braucht deinen Blick</h2></div><WarningCircle size={22} aria-hidden="true" /></div><div className={styles.actionList}>{actions.map((action, index) => <Link href={action.href} key={action.id} prefetch={false}><span className={styles.actionNumber}>0{index + 1}</span><div><h3>{action.title}</h3><p>{action.detail}</p></div><ArrowUpRight size={16} aria-hidden="true" /></Link>)}</div><Link href="/automation" className={styles.textLink}>Alle Aufträge <ArrowRight size={15} aria-hidden="true" /></Link></section>
    </div>

    <section id="agenten" className={styles.panel} aria-labelledby="agents-heading">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Dein digitales Team</p><h2 id="agents-heading">Wer macht was?</h2><p className={styles.muted}>Aufgaben, Rhythmus und letzter belegter Lauf.</p></div><Link href="/agents" className={styles.textLink}>Agentenverwaltung <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <div className={styles.agentSource}><span className={`${styles.statusDot} ${agentData.runtime.state === "fresh" ? styles.dotOk : styles.dotUnknown}`} /><span>{agentData.runtime.state === "fresh" ? "Aktuelle M1-Beobachtung" : agentData.runtime.state === "stale" ? "M1-Beobachtung veraltet" : "Laufdaten nicht verfügbar"} · {dateTime(agentData.runtime.snapshot?.observedAt ?? null)}</span></div>
      <div className={styles.agentGrid}>{benefitsiAgents.map(agent => <AgentCard key={agent.id} agent={agent} />)}</div>
      {!benefitsiAgents.length ? <div className={styles.empty}><h3>Keine Benefitsi-Profile nachgewiesen</h3><p>In der Agentenverwaltung kannst du Quellen und Konfiguration prüfen.</p></div> : null}
      {otherAgents.length ? <details className={styles.otherAgents}><summary>Weitere beobachtete Profile ({otherAgents.length})</summary><div className={styles.agentGrid}>{otherAgents.map(agent => <AgentCard key={agent.id} agent={agent} />)}</div></details> : null}
      <div className={styles.agentWorkflow}><span>Auftrag</span><ArrowRight size={14} aria-hidden="true" /><span>Recherche</span><ArrowRight size={14} aria-hidden="true" /><span>Prüfung</span><ArrowRight size={14} aria-hidden="true" /><span>Freigabe</span><ArrowRight size={14} aria-hidden="true" /><span>Veröffentlichung</span></div>
      <p className={styles.footnote}>Beobachtete und dokumentierte Profile, kein Prozessmonitor. Technischer Erfolg bestätigt keine redaktionelle Freigabe.</p>
    </section>

    <section id="tarife" aria-labelledby="tiers-heading"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>Für wen ist was?</p><h2 id="tiers-heading">Nutzer & Partner. Klar getrennt.</h2><p className={styles.muted}>Pakete, Zugänge und die wichtigsten Unterschiede.</p></div></div><div className={styles.tierGroups}>{(["Nutzer", "Partner"] as const).map(audience => <div key={audience} className={styles.tierGroup}><h3>{audience === "Nutzer" ? "Für deine Nutzer" : "Für deine Partner"}</h3>{tierCatalog.filter(tier => tier.audience === audience).map(tier => <article className={styles.tierCard} key={tier.id}><div className={styles.tierTitle}><h4>{tier.name}</h4><Link href={tier.href} prefetch={false} aria-label={`${audience}: ${tier.name} ansehen`}><ArrowUpRight size={18} aria-hidden="true" /></Link></div><p>{tier.description}</p><ul>{tier.features.map(feature => <li key={feature}><Check size={14} aria-hidden="true" />{feature}</li>)}</ul><small>{tier.note}</small></article>)}</div>)}</div></section>
    <EcosystemExplorer />
    <PageDirectory pages={pages} incomplete={incomplete} />
    <section className={styles.destinations} aria-label="Zentrale Zugänge"><div><GlobeHemisphereWest size={23} aria-hidden="true" /><span>Deine Plattform, direkt erreichbar</span></div><a href="https://benefitsi.de" target="_blank" rel="noreferrer">Website <ArrowUpRight size={16} aria-hidden="true" /></a><a href="https://partner.benefitsi.de" target="_blank" rel="noreferrer">Partner-Portal <ArrowUpRight size={16} aria-hidden="true" /></a><Link href="/wissen">Wissen <ArrowUpRight size={16} aria-hidden="true" /></Link><Link href="/system">System <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
  </div>
}

function AgentCard({ agent }: { agent: ReturnType<typeof buildAgentSummaries>[number] }) {
  return <article className={styles.agentCard}><div className={styles.agentHeading}><div className={styles.agentIcon}><Robot size={20} weight="duotone" aria-hidden="true" /></div><div><h3>{agent.name}</h3><span>{agent.mode}</span></div><span className={`${styles.badge} ${agent.status === "ok" ? styles.badgeOk : agent.status === "attention" ? styles.badgeAttention : styles.badgeNeutral}`}>{agent.statusLabel}</span></div><p className={styles.agentPurpose}>{agent.purpose}</p><div className={styles.agentDetails}><span>{agent.cadence}</span><span>Letzter Lauf: {dateTime(agent.lastRunAt)}</span></div><Link href={agent.href} className={styles.agentLink} prefetch={false}>Profil & Details <ArrowUpRight size={14} aria-hidden="true" /></Link></article>
}

function ActivityChart({ series }: { series: AnalyticsTimeSeries }) {
  const points = series.points
  const finite = points.flatMap(point => point.value !== null && Number.isFinite(point.value) ? [point.value] : [])
  if (!finite.length) return <div className={styles.chartEmpty}><p>Für diesen Zeitraum fehlen Messwerte.</p></div>
  const min = Math.min(0, ...finite), max = Math.max(1, ...finite), spread = max - min
  const x = (index: number) => 48 + index / Math.max(1, points.length - 1) * 572
  const y = (value: number) => 165 - (value - min) / spread * 133
  let path = "", previousValid = false
  points.forEach((point, index) => {
    if (point.value === null || !Number.isFinite(point.value)) { previousValid = false; return }
    path += `${previousValid ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)} `
    previousValid = true
  })
  const format = (value: number) => formatAnalyticsValue(value, series.unit)
  return <figure className={styles.chart}><figcaption><strong>{series.title}</strong><span>{qualityLabels[series.quality] ?? series.quality}</span></figcaption><svg viewBox="0 0 640 210" role="img" aria-label={`${series.title}, ${points.length} Zeitpunkte; Datenlücken bleiben unterbrochen. Werte als Tabelle unter dem Diagramm.`}>
    {[0, .5, 1].map(ratio => <g key={ratio}><line x1="48" x2="620" y1={32 + 133 * ratio} y2={32 + 133 * ratio} stroke="#e7ecee" strokeDasharray="3 5" /><text x="40" y={36 + 133 * ratio} textAnchor="end" fill="#62717e" fontSize="10">{format(max - spread * ratio)}</text></g>)}
    <path d={path} fill="none" stroke="#078c9b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {points.map((point, index) => point.value !== null && Number.isFinite(point.value) ? <circle key={index} cx={x(index)} cy={y(point.value)} r={points.length < 40 ? 3 : 1.5} fill="#078c9b"><title>{point.label ?? point.date}: {format(point.value)}</title></circle> : null)}
    <text x="48" y="192" fill="#62717e" fontSize="11">{points[0]?.label ?? points[0]?.date}</text><text x="620" y="192" textAnchor="end" fill="#62717e" fontSize="11">{points.at(-1)?.label ?? points.at(-1)?.date}</text>
  </svg><details className={styles.dataNotes}><summary>Messwerte als Tabelle</summary><div className={styles.chartTable}><table><thead><tr><th scope="col">Zeitpunkt</th><th scope="col">Wert</th></tr></thead><tbody>{points.map((point, index) => <tr key={index}><td>{point.label ?? point.date}</td><td>{point.value === null || !Number.isFinite(point.value) ? "Nicht verfügbar" : format(point.value)}</td></tr>)}</tbody></table></div></details><p className={styles.footnote}>Quelle: {series.source}{series.description ? ` · ${series.description}` : ""}</p></figure>
}

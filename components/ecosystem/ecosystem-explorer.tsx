"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowUpRight, MagnifyingGlass, X } from "@phosphor-icons/react"
import { ecosystemCatalog, type EcosystemEntry } from "@/lib/ecosystem/catalog"
import type { EcosystemPage } from "@/lib/ecosystem/directory"
import styles from "./ecosystem.module.css"

const groups: { id: "all" | EcosystemEntry["group"]; label: string }[] = [
  { id: "all", label: "Alles" }, { id: "app", label: "App & Nutzer" },
  { id: "partner", label: "Partner" }, { id: "deals", label: "Deals & Treue" },
  { id: "platform", label: "Plattform" },
]

export function EcosystemExplorer() {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<(typeof groups)[number]["id"]>("all")
  const term = query.trim().toLocaleLowerCase("de")
  const entries = ecosystemCatalog.filter(entry => (group === "all" || entry.group === group)
    && `${entry.title} ${entry.description} ${entry.audience} ${entry.availability}`.toLocaleLowerCase("de").includes(term))

  return <section id="features" className={styles.panel} aria-labelledby="features-heading">
    <div className={styles.sectionHead}>
      <div><p className={styles.eyebrow}>Das kann Benefitsi</p><h2 id="features-heading">Ein Ecosystem. Alles im Blick.</h2><p className={styles.muted}>Features, Vorteile und Werkzeuge – jeweils in einem Satz.</p></div>
      <span className={styles.count}>{ecosystemCatalog.length} Einträge</span>
    </div>
    <div className={styles.searchBox}>
      <label htmlFor="ecosystem-search" className={styles.srOnly}>Features, Deals und Werkzeuge durchsuchen</label>
      <MagnifyingGlass size={19} aria-hidden="true" />
      <input id="ecosystem-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Zum Beispiel: Stempel, Premium, Buchung …" />
      {query ? <button type="button" onClick={() => setQuery("")} aria-label="Suche zurücksetzen"><X size={17} /></button> : null}
    </div>
    <div className={styles.filters} role="group" aria-label="Feature-Kategorien">
      {groups.map(item => <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>{item.label}<span>{item.id === "all" ? ecosystemCatalog.length : ecosystemCatalog.filter(entry => entry.group === item.id).length}</span></button>)}
    </div>
    <p className={styles.resultCount} role="status">{entries.length} {entries.length === 1 ? "Eintrag" : "Einträge"}{term ? ` für „${query}“` : ""}</p>
    <div className={styles.catalogList}>
      {entries.map(entry => <article key={entry.id} className={styles.catalogRow}>
        <div><Link href={entry.href} prefetch={false} className={styles.featureTitle}>{entry.title}<ArrowUpRight size={14} aria-hidden="true" /></Link><p>{entry.description}</p></div>
        <div className={styles.entryMeta}><span>{entry.audience}</span><small>{entry.availability}</small></div>
      </article>)}
    </div>
    {entries.length === 0 ? <div className={styles.empty}><h3>Kein passender Eintrag</h3><p>Versuche einen anderen Suchbegriff oder zeige alle Kategorien.</p><button type="button" onClick={() => { setGroup("all"); setQuery("") }}>Filter zurücksetzen</button></div> : null}
    <p className={styles.footnote}>Katalogstand: 02.10.2026 · Funktionen und geplante Erweiterungen. Zugänge hängen vom Tarif und der jeweiligen Freischaltung ab.</p>
  </section>
}

export function PageDirectory({ pages, incomplete }: { pages: EcosystemPage[]; incomplete: boolean }) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("Alle Seiten")
  const term = query.trim().toLocaleLowerCase("de")
  const filtered = pages.filter(page => (kind === "Alle Seiten" || page.kind === kind)
    && `${page.title} ${page.description}`.toLocaleLowerCase("de").includes(term))
  return <section id="seiten" className={styles.panel} aria-labelledby="pages-heading">
    <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Direkt zum Ziel</p><h2 id="pages-heading">Städteseiten & Microsites</h2><p className={styles.muted}>Öffentliche Seiten öffnen oder direkt im Admin bearbeiten.</p></div><span className={styles.count}>{pages.length} geladene Einträge</span></div>
    {incomplete ? <p className={styles.notice}>Ein Teil der Seitendaten ist nicht verfügbar. Diese Liste kann unvollständig sein.</p> : null}
    <div className={styles.directoryControls}>
      <div className={styles.searchBox}><label className={styles.srOnly} htmlFor="page-search">Seiten durchsuchen</label><MagnifyingGlass size={18} aria-hidden="true" /><input id="page-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Stadt oder Partner suchen …" /></div>
      <div><label className={styles.srOnly} htmlFor="page-type">Seitentyp</label><select id="page-type" value={kind} onChange={event => setKind(event.target.value)}><option>Alle Seiten</option><option>Stadtseite</option><option>Microsite</option></select></div>
    </div>
    <p className={styles.resultCount} role="status">{filtered.length} {filtered.length === 1 ? "Seite" : "Seiten"}</p>
    <div className={styles.pageList}>{filtered.map(page => <article key={page.id} className={styles.pageRow}>
      <div><span className={styles.pageType}>{page.kind}</span><h3>{page.title}</h3><p>{page.description} <span aria-hidden="true">·</span> {page.status}</p></div>
      <div className={styles.pageActions}>{page.href ? <a href={page.href} target="_blank" rel="noreferrer" aria-label={`${page.title}: öffentliche Seite öffnen (neuer Tab)`}>Seite öffnen <ArrowUpRight size={15} aria-hidden="true" /></a> : <span className={styles.muted}>Kein bestätigter öffentlicher Link</span>}<Link href={page.adminHref} prefetch={false}>Verwalten</Link></div>
    </article>)}</div>
    {!filtered.length ? <div className={styles.empty}><h3>{query || kind !== "Alle Seiten" ? "Keine passenden Seiten" : "Noch keine Seiten verfügbar"}</h3><p>{query || kind !== "Alle Seiten" ? "Passe den Suchbegriff oder den Seitentyp an." : "Sobald Stadtprofile oder Partner vorliegen, erscheinen sie hier."}</p></div> : null}
  </section>
}

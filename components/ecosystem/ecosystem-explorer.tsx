"use client"

import Link from "next/link"
import { useAdminLanguage } from "@/app/admin-language"
import { useState } from "react"
import {
  ArrowRight, ArrowUpRight, Bell, BookOpen, Buildings, CalendarBlank,
  CaretDown, ChartLineUp, Clock, CreditCard, Crown, FileText,
  GlobeHemisphereWest, Heart, MagnifyingGlass, MapPin, Scan,
  ShieldCheck, Sparkle, Stack, Storefront, Users, X,
} from "@phosphor-icons/react"
import { BenefitIcon } from "@/components/benefit-icon"
import { ecosystemCatalog, type EcosystemEntry } from "@/lib/ecosystem/catalog"
import type { EcosystemPage } from "@/lib/ecosystem/directory"
import styles from "./ecosystem.module.css"

const groups = [
  { id: "app", label: "App", detail: "Nutzer & Entdecken", Icon: Scan },
  { id: "partner", label: "Partner", detail: "Betrieb & Wachstum", Icon: Storefront },
  { id: "deals", label: "Vorteile", detail: "Deals & Treue", Icon: null },
  { id: "platform", label: "Plattform", detail: "Städte & Werkzeuge", Icon: GlobeHemisphereWest },
] as const

function featureIcon(entry: EcosystemEntry) {
  const title = entry.title.toLowerCase()
  if (/stempel|qr|scan/.test(title)) return Scan
  if (/premium|pro |founder/.test(title)) return Crown
  if (/karte|stadtpass|orte/.test(title)) return MapPin
  if (/zeit/.test(title)) return Clock
  if (/feedback|favorit|merk/.test(title)) return Heart
  if (/team|konto|profil|registrier|community/.test(title)) return Users
  if (/benachrichtigung|newsletter/.test(title)) return Bell
  if (/statistik|auswertung|seo/.test(title)) return ChartLineUp
  if (/vertrag|tarif|zahlung/.test(title)) return CreditCard
  if (/menü|speise/.test(title)) return Storefront
  if (/ki|design/.test(title)) return Sparkle
  if (/artikel|redaktion|inhalt/.test(title)) return FileText
  if (/datenschutz|recht|freigabe/.test(title)) return ShieldCheck
  if (/buch|termin|veranstalt/.test(title)) return CalendarBlank
  if (/guide|wissen/.test(title)) return BookOpen
  return entry.group === "platform" ? Buildings : Stack
}

const featureIcons = Object.fromEntries(ecosystemCatalog.map(entry => [entry.id, featureIcon(entry)]))

function FeatureGlyph({ entry }: { entry: EcosystemEntry }) {
  if (entry.benefitIcon) return <BenefitIcon name={entry.benefitIcon} size={22} />
  const Icon = featureIcons[entry.id]
  return <Icon size={22} weight="duotone" aria-hidden="true" />
}

export function EcosystemExplorer() {
  const [group, setGroup] = useState<EcosystemEntry["group"] | "all" | null>(null)
  const entries = ecosystemCatalog.filter(entry => !group || group === "all" || entry.group === group)
  const showResults = Boolean(group)

  return <section id="features" className={styles.catalogSection} aria-labelledby="features-heading">
    <div className={styles.sectionHead}><h2 id="features-heading">Dein Produkt<span>.</span></h2><button className={styles.showAll} type="button" onClick={() => setGroup(showResults ? null : "all")}>{showResults ? "Schließen" : `${ecosystemCatalog.length} Features`}{showResults ? <X size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}</button></div>
    <div className={styles.categoryGrid}>{groups.map(({ Icon, ...item }) => <button className={styles.categoryTile} key={item.id} type="button" aria-pressed={group === item.id} onClick={() => setGroup(group === item.id ? null : item.id)}>
      <div className={styles.categoryVisual}>{Icon ? <Icon size={27} weight="duotone" aria-hidden="true" /> : <BenefitIcon name="reward" size={27} />}<strong>{ecosystemCatalog.filter(entry => entry.group === item.id).length}</strong></div><div className={styles.categoryLabel}><h3>{item.label}</h3><ArrowRight size={17} aria-hidden="true" /></div><span>{item.detail}</span>
    </button>)}</div>

    {showResults ? <div className={styles.catalogResults}>
      <div className={styles.filterHeader}><p className={styles.resultCount} role="status">{entries.length} {entries.length === 1 ? "Eintrag" : "Einträge"}</p>{group && group !== "all" ? <button type="button" onClick={() => setGroup("all")}>Alle Kategorien <X size={13} aria-hidden="true" /></button> : null}</div>
      <div className={styles.featureGrid}>{entries.map(entry => { const planned = /geplant|noch nicht verfügbar|noch nicht buchbar/i.test(entry.availability); return <details className={styles.featureCard} key={entry.id}><summary><span className={styles.featureGlyph}><FeatureGlyph entry={entry} /></span><h3>{entry.title}</h3>{planned ? <span className={styles.planned}>Geplant</span> : null}<CaretDown size={14} aria-hidden="true" /></summary><div className={styles.featureExpanded}><p>{entry.description}</p><span>{entry.audience}</span><small>{entry.availability}</small><Link href={entry.href} prefetch={false}>Öffnen <ArrowUpRight size={14} aria-hidden="true" /></Link></div></details> })}</div>
      {!entries.length ? <div className={styles.empty}><MagnifyingGlass size={28} aria-hidden="true" /><h3>Keine Treffer</h3><button type="button" onClick={() => setGroup(null)}>Filter zurücksetzen</button></div> : null}
    </div> : null}
  </section>
}

export function PageDirectory({ pages, incomplete }: { pages: EcosystemPage[]; incomplete: boolean }) {
  const { language } = useAdminLanguage()
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("Alle Seiten")
  const term = query.trim().toLocaleLowerCase("de")
  const filtered = pages.filter(page => (kind === "Alle Seiten" || page.kind === kind)
    && `${page.title} ${page.description}`.toLocaleLowerCase("de").includes(term))
  const cityCount = pages.filter(page => page.kind === "Stadtseite").length
  const micrositeCount = pages.filter(page => page.kind === "Microsite").length
  return <section id="seiten" aria-label="Städteseiten und Microsites"><details className={styles.directoryDisclosure}>
    <summary><div className={styles.directoryArtwork} aria-hidden="true"><div><MapPin size={28} weight="duotone" /></div><div><GlobeHemisphereWest size={28} weight="duotone" /></div></div><div className={styles.directoryTitle}><h2>Deine Seiten<span>.</span></h2><p data-admin-i18n-ignore="true">{`${cityCount} ${language === "de" ? (cityCount === 1 ? "Stadt" : "Städte") : (cityCount === 1 ? "City" : "Cities")} · ${micrositeCount} ${language === "de" ? "Partner" : (micrositeCount === 1 ? "Partner" : "Partners")} · ${language === "de" ? (incomplete ? "Unvollständig" : "Geladener Bestand") : (incomplete ? "Incomplete" : "Loaded inventory")}`}</p></div><span className={styles.directoryExpand}>Verzeichnis <span>+</span></span></summary>
    <div className={styles.directoryContent}>
      {incomplete ? <p className={styles.notice}>Seitendaten teilweise nicht verfügbar.</p> : null}
      <div className={styles.directoryControls}><div className={styles.searchBox}><label className={styles.srOnly} htmlFor="page-search">Seiten durchsuchen</label><MagnifyingGlass size={18} aria-hidden="true" /><input id="page-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Stadt oder Partner …" /></div><div><label className={styles.srOnly} htmlFor="page-type">Seitentyp</label><select id="page-type" value={kind} onChange={event => setKind(event.target.value)}><option value="Alle Seiten">Alle Seiten</option><option value="Stadtseite">Stadtseite</option><option value="Microsite">Microsite</option></select></div></div>
      <p className={styles.resultCount} role="status">{filtered.length} {filtered.length === 1 ? "Seite" : "Seiten"}</p><div className={styles.pageGrid}>{filtered.map(page => { const Icon = page.kind === "Stadtseite" ? Buildings : Storefront; return <article key={page.id} className={styles.pageCard}><span className={styles.pageGlyph}><Icon size={24} weight="duotone" aria-hidden="true" /></span><div className={styles.pageInfo}><h3 data-admin-i18n-ignore="true">{page.title}</h3><p>{page.status}</p></div><div className={styles.pageActions}>{page.href ? <a href={page.href} target="_blank" rel="noreferrer" aria-label={`${page.title}: öffentliche Seite öffnen (neuer Tab)`}><ArrowUpRight size={18} aria-hidden="true" /></a> : null}<Link href={page.adminHref} prefetch={false} aria-label={`${page.title}: verwalten`}>Verwalten</Link></div></article> })}</div>
      {!filtered.length ? <div className={styles.empty}><MapPin size={28} aria-hidden="true" /><h3>{query || kind !== "Alle Seiten" ? "Keine passenden Seiten" : "Keine Seiten geladen"}</h3></div> : null}
    </div>
  </details></section>
}

"use client"

import Link from "next/link"
import { BenefitsiKnowledgeEntry } from "@/components/knowledge/benefitsi-knowledge-entry"
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowUpRight, BookOpen, Storefront, Users } from "@phosphor-icons/react"
import { useAdminLanguage } from "@/app/admin-language"
import { tierCatalog } from "@/lib/ecosystem/catalog"
import { EcosystemExplorer } from "./ecosystem-explorer"
import styles from "./ecosystem.module.css"

const tabs = ["Funktionen", "Zugänge", "Wissen"] as const
export function EcosystemProductHub({ knowledge }: { knowledge?: ReactNode }) {
  const { tr } = useAdminLanguage()
  const [tab, setTab] = useState(0)
  const [tierId, setTierId] = useState(tierCatalog[0].id)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const tier = tierCatalog.find(entry => entry.id === tierId) ?? tierCatalog[0]
  function switchTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault(); setTab(next); buttons.current[next]?.focus()
  }
  return <section className={styles.productHub} aria-labelledby="product-heading">
    <div className={styles.hubHead}><div><h2 id="product-heading">Produkt &amp; Wissen</h2><p>Funktionen, Zugänge und Wissensstand</p></div><div role="tablist" aria-label={tr("Produktübersicht")} className={styles.hubTabs}>{tabs.map((label,index) => <button key={label} ref={button => { buttons.current[index] = button }} type="button" role="tab" aria-selected={tab === index} aria-controls={`product-panel-${index}`} id={`product-tab-${index}`} tabIndex={tab === index ? 0 : -1} onKeyDown={event => switchTab(event,index)} onClick={() => setTab(index)}>{label}</button>)}</div></div>
    <div role="tabpanel" aria-labelledby="product-tab-0" id="product-panel-0" hidden={tab !== 0}><EcosystemExplorer compact /><p className={styles.hubNote}>Kuratierter Funktionskatalog. Veröffentlichungsstatus je Funktion beachten.</p></div>
    <div role="tabpanel" aria-labelledby="product-tab-1" id="product-panel-1" hidden={tab !== 1}>
      <div className={styles.tierToggle} role="group" aria-label={tr("Zugang auswählen")}>{tierCatalog.map(entry => <button type="button" key={entry.id} aria-pressed={tierId === entry.id} onClick={() => setTierId(entry.id)}>{entry.audience === "Partner" ? <Storefront size={16} aria-hidden="true" /> : <Users size={16} aria-hidden="true" />}<span>{tr(`${entry.audience} ${entry.name}`)}</span></button>)}</div>
      <div className={styles.tierShared}><div><h3>{tr(`${tier.audience} ${tier.name}`)}</h3><p>{tier.description}</p><Link href={tier.href} prefetch={false}>Ansehen <ArrowUpRight size={14} aria-hidden="true" /></Link></div><div><ul>{tier.features.map(feature => <li key={feature}>{feature}</li>)}</ul><p className={styles.hubNote}>{tier.note}</p></div></div>
    </div>
    <div role="tabpanel" aria-labelledby="product-tab-2" id="product-panel-2" hidden={tab !== 2}>
      {knowledge ?? <p className={styles.hubNote}>Wissensstatus derzeit nicht verfügbar.</p>}
      <details className={styles.knowledgeCapture}><summary>Aufgabe oder Wissen speichern</summary><BenefitsiKnowledgeEntry /></details>
      <div className={styles.knowledgeLink}><p>Der Wissensspiegel bleibt schreibgeschützt. Neue Aufgaben, Entscheidungen und Ergebnisse werden im Benefitsi-Obsidian-Vault gespeichert.</p><Link href="/wissen" prefetch={false}><BookOpen size={17} aria-hidden="true" /> Wissensspiegel öffnen <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
    </div>
  </section>
}

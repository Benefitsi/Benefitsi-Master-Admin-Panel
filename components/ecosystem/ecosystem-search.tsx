"use client"

import Link from "next/link"
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { ArrowUpRight, Compass, Crown, GlobeHemisphereWest, MagnifyingGlass, Robot, SquaresFour, X } from "@phosphor-icons/react"
import { useAdminLanguage } from "@/app/admin-language"
import { baseSearchEntries, searchEcosystem, type EcosystemSearchEntry } from "@/lib/ecosystem/search"
import styles from "./ecosystem-search.module.css"

type Registration = { entries: EcosystemSearchEntry[]; state: "ready" | "partial" }
type SearchSource = "agents" | "pages"
const SearchContext = createContext<{
  sources: Partial<Record<SearchSource, Registration>>
  register: (source: SearchSource, value: Registration) => void
} | null>(null)

/** Stream sections independently and reuse their safe, already-loaded metadata. */
export function EcosystemSearchProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Partial<Record<SearchSource, Registration>>>({})
  const register = useCallback((source: SearchSource, value: Registration) => {
    setSources(previous => ({ ...previous, [source]: value }))
  }, [])
  return <SearchContext.Provider value={{ sources, register }}>{children}</SearchContext.Provider>
}

export function EcosystemSearchRegistration({ source, entries, state }: Registration & { source: SearchSource }) {
  const register = useContext(SearchContext)?.register
  useEffect(() => { register?.(source, { entries, state }) }, [register, source, entries, state])
  return null
}

const icons = { area: Compass, feature: SquaresFour, tier: Crown, agent: Robot, page: GlobeHemisphereWest }
const kindLabels = { area: "Bereich", feature: "Feature", tier: "Tarif", agent: "Agent", page: "Seite" }
const englishKinds = { area: "Area", feature: "Feature", tier: "Plan", agent: "Agent", page: "Page" }

export function EcosystemSearch() {
  const context = useContext(SearchContext)
  const { language } = useAdminLanguage()
  const english = language === "en"
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const entries = [...baseSearchEntries, ...Object.values(context?.sources ?? {}).flatMap(source => source.entries)]
  const results = searchEcosystem(entries, query)
  const visible = open && query.trim().length > 0
  const loaded = context?.sources.agents && context?.sources.pages
  const partial = Object.values(context?.sources ?? {}).some(source => source.state === "partial")

  return <div className={styles.search} ref={container} data-admin-i18n-ignore="true"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault()
        input.current?.focus()
        setOpen(false)
      }
    }}>
    <div className={styles.field} role="search">
      <MagnifyingGlass size={17} aria-hidden="true" />
      <label htmlFor={id} className={styles.srOnly}>{english ? "Search the ecosystem" : "Ecosystem durchsuchen"}</label>
      <input id={id} ref={input} type="search" value={query} autoComplete="off" spellCheck={false}
        placeholder={english ? "Search everything …" : "Alles finden …"}
        aria-controls={visible ? `${id}-results` : undefined}
        aria-describedby={visible ? `${id}-count` : undefined}
        onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" && visible) {
            event.preventDefault()
            container.current?.querySelector<HTMLAnchorElement>("nav a")?.focus()
          }
        }} />
      {query ? <button type="button" aria-label={english ? "Clear search" : "Suche leeren"} onClick={() => { setQuery(""); input.current?.focus() }}><X size={15} aria-hidden="true" /></button> : null}
    </div>
    {visible ? <div className={styles.popover} id={`${id}-results`}>
      <div className={styles.resultHeader}><span id={`${id}-count`} role="status">{results.length ? `${results.length} ${english ? "results" : "Treffer"}` : english ? "No results" : "Keine Treffer"}</span><span>ESC</span></div>
      <nav aria-label={english ? "Search results" : "Suchergebnisse"} className={styles.results}>
        {results.slice(0, 16).map(entry => {
          const Icon = icons[entry.kind]
          const external = entry.href.startsWith("https://")
          return <div className={styles.result} key={entry.id}>
            <Link href={entry.href} prefetch={false} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} onClick={() => setOpen(false)}>
              <span className={styles.glyph}><Icon size={21} weight="duotone" aria-hidden="true" /></span>
              <span className={styles.resultText}><strong>{entry.title}</strong><span>{entry.description}</span></span>
              <small>{(english ? englishKinds : kindLabels)[entry.kind]}</small>
            </Link>
            {entry.publicHref ? <a className={styles.publicLink} href={entry.publicHref} target="_blank" rel="noreferrer" aria-label={`${entry.title}: ${english ? "open public page" : "öffentliche Seite öffnen"}`}><ArrowUpRight size={16} aria-hidden="true" /></a> : null}
          </div>
        })}
      </nav>
      {!results.length ? <p className={styles.empty}>{english ? "Try an agent, feature, city or partner." : "Suche nach Agent, Feature, Stadt oder Partner."}</p> : null}
      {results.length > 16 ? <p className={styles.sourceNote}>{english ? "16 shown. Refine your search for more precise results." : "16 angezeigt. Suche eingrenzen für genauere Treffer."}</p> : null}
      {!loaded || partial ? <p className={styles.sourceNote}>{!loaded
        ? english ? "Agents and pages are still loading." : "Agenten und Seiten werden noch geladen."
        : english ? "Some sources are unavailable. Results may be incomplete." : "Quellen teilweise nicht verfügbar. Treffer können fehlen."}</p> : null}
    </div> : null}
  </div>
}

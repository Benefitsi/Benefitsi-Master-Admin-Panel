/* eslint-disable @next/next/no-img-element -- Partner-selected assets can use arbitrary storage hosts. */
"use client"

import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowRight, BedDouble, Car, Clock3, Compass, Dumbbell, Film, Gift, Handshake, Landmark, Leaf, MapPin, Mountain, Phone, Route, Scissors, Sun, type LucideIcon } from "lucide-react"
import type { PartnerWithDeals } from "@/lib/admin-data"
import type { MicrositeConfig } from "@/lib/microsites"
import { categoryThemeContent, type CategoryMicrositeTemplateId } from "@/lib/microsite-category-themes"
import { partnerSocialUrl } from "@/lib/microsite-personalization"
import { micrositeFaqItemsForPartner } from "@/lib/microsite-seo"
import { getMicrositePublicDeals, getMicrositeStampRewards } from "@/lib/microsite-content"
import { micrositeMenuItemDisplayName, micrositeMenuItemKey, micrositeMenuPreviewItems } from "@/lib/microsite-menu"
import {
  AppDownloadQrPopup, DealsSection, MicrositeThemeCss, PartnerSocialFeed,
  PremiumMotionEffects, SiteHeader, appDownloadUrlForPartner, editable, imageStyleFor,
  micrositeMenuItemsForPartner, micrositeThemeVars, restaurantTheme, textStyleFor, textValue, useResolvedPalette,
} from "./restaurant-premium-microsite"
import styles from "./category-premium-microsite.module.css"

const icons: Record<string, LucideIcon> = { scissors: Scissors, leaf: Leaf, bed: BedDouble, car: Car, route: Route, film: Film, dumbbell: Dumbbell, mountain: Mountain, sun: Sun, landmark: Landmark, handshake: Handshake, compass: Compass }

type Props = { partner: PartnerWithDeals; config: MicrositeConfig; template: CategoryMicrositeTemplateId; showAppDownloadPopup?: boolean }

export function CategoryPremiumMicrosite({ partner, config, template, showAppDownloadPopup = true }: Props) {
  const copy = categoryThemeContent(partner, template, config.language)
  const en = config.language === "en"
  const t = (de: string, english: string) => en ? english : de
  const Icon = icons[copy.theme.icon] || Compass
  const logo = config.branding.logoUrl || partner.logo_url || ""
  const palette = useResolvedPalette(config, logo)
  const automaticWithoutLogo = config.branding.paletteMode === "auto" && !logo
  const style = {
    ...micrositeThemeVars(config),
    "--site-accent": automaticWithoutLogo ? copy.theme.accent : palette.primary,
    "--site-secondary": automaticWithoutLogo ? copy.theme.secondary : palette.secondary,
    "--site-tertiary": automaticWithoutLogo ? copy.theme.accent : palette.tertiary,
  } as CSSProperties
  const heroImage = config.hero.backgroundImageUrl !== "/upload-image.jpg" ? config.hero.backgroundImageUrl : ""
  const name = partner.name || config.hero.headline
  const website = partnerSocialUrl(partner, "website")
  const phone = partner.phone?.replace(/[^\d+]/g, "")
  const contactHref = website || (phone ? `tel:${phone}` : "#kontakt")
  const address = partner.address || partner.city_name || ""
  const mapUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : ""
  const appUrl = textValue(config, "content.appDownloadUrl", appDownloadUrlForPartner(partner))
  const storyImage = partner.cover_urls?.find((url) => url !== heroImage)
  const theme = restaurantTheme()
  const hasBenefits = getMicrositePublicDeals(partner.deals).length > 0 || getMicrositeStampRewards(partner.reward_milestones).length > 0



  return (
    <article lang={config.language} style={style} data-template={template} data-layout={copy.theme.layout}
      className={`premium-microsite @container ${styles.site} ${config.appearance.mode === "dark" ? "premium-microsite-dark" : ""}`}>
      <MicrositeThemeCss />
      <PremiumMotionEffects />
      <a className={styles.skipLink} href="#partner-content">{t("Zum Inhalt", "Skip to content")}</a>
      <SiteHeader partner={partner} config={config} theme={theme} />
      <div id="partner-content">
        <section className={styles.hero} aria-label={name}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}><Icon size={19} aria-hidden="true" />{copy.label}<span> / </span>{config.hero.locationText}</p>
            <EditableCopy config={config} id="hero.headline" as="h1">{config.hero.headline}</EditableCopy>
            <EditableCopy config={config} id="hero.slogan" className={styles.slogan}>{config.hero.slogan}</EditableCopy>
            <div className={styles.heroActions}>
              <a href={contactHref} className={styles.primaryLink}>{copy.action}<ArrowRight size={18} aria-hidden="true" /></a>
              {hasBenefits && <a href="#deals" className={styles.textLink}>{config.hero.primaryButtonLabel}<Gift size={17} aria-hidden="true" /></a>}
            </div>
            <div className={styles.heroMeta}>
              {address && <span><MapPin size={16} aria-hidden="true" />{address}</span>}
              <span><Gift size={16} aria-hidden="true" />{t("Offizieller Benefitsi Partner", "Official Benefitsi partner")}</span>
            </div>
          </div>
          <div className={styles.heroVisual}>
            {heroImage ? <img {...editable("hero.backgroundImageUrl", "image", t("Startbild", "Hero image"))} src={heroImage} alt={name} style={imageStyleFor(config, "hero.backgroundImageUrl")} fetchPriority="high" />
              : <div className={styles.imageFallback}><Icon strokeWidth={.8} aria-hidden="true" /><span>{copy.label}</span></div>}
            <a className={styles.visualCaption} href="#speisekarte"><span>{copy.label}</span><ArrowRight size={20} aria-hidden="true" /></a>
          </div>
        </section>

        <section id="speisekarte" className={styles.offerings}>
          <div className={styles.sectionHeading}>
            <div><EditableCopy config={config} id="content.menuLabel" className={styles.eyebrow}>{config.content.menuLabel}</EditableCopy><EditableCopy config={config} id="content.menuHeadline" as="h2">{config.content.menuHeadline}</EditableCopy></div>
            <EditableCopy config={config} id="content.menuDescription">{config.content.menuDescription}</EditableCopy>
          </div>
          <OfferingList partner={partner} config={config} Icon={Icon} contactHref={contactHref} action={copy.action} />
        </section>

        <section className={styles.planning} aria-label={t("Deinen Besuch planen", "Plan your visit")}>
          <div className={styles.planningIntro}><Icon size={28} strokeWidth={1.3} aria-hidden="true" /><h2>{t("Gut zu wissen, bevor es losgeht.", "Good to know before you go.")}</h2><p>{copy.note}</p></div>
          <ol>{copy.planning.map((step, index) => <li key={step}><span>0{index + 1}</span><p>{step}</p><ArrowRight size={18} aria-hidden="true" /></li>)}</ol>
        </section>

        <DealsSection partner={partner} config={config} template={template} showEcosystem={false} showLoyalty={getMicrositeStampRewards(partner.reward_milestones).length > 0} />

        <section id="ueber-uns" className={`${styles.story} ${storyImage ? styles.storyWithImage : ""}`}>
          {storyImage && <img src={storyImage} alt={name} loading="lazy" />}
          <div><p className={styles.eyebrow}>{t("Lokal verbunden", "Rooted locally")} / {name}</p><EditableCopy config={config} id="content.aboutHeadline" as="h2">{config.content.aboutHeadline}</EditableCopy><EditableCopy config={config} id="content.aboutText">{config.content.aboutText}</EditableCopy>
            <a href="#kontakt" className={styles.textLink}>{copy.action}<ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </section>

        <PartnerSocialFeed partner={partner} config={config} />

        <section id="app" className={styles.app}>
          <div><p className={styles.eyebrow}>Benefitsi App</p><EditableCopy config={config} id="content.appHeadline" as="h2">{config.content.appHeadline}</EditableCopy><EditableCopy config={config} id="content.appText">{config.content.appText}</EditableCopy><a className={styles.primaryLink} href={appUrl}>{t("In der App entdecken", "Explore in the app")}<ArrowRight size={18} aria-hidden="true" /></a></div>
          <div className={styles.membership}><img src="/Benefitsi_Icon_FullColor_RGB_512.png" alt="Benefitsi" width={44} height={44} /><span>Benefitsi × {name}</span><Gift size={54} strokeWidth={1} aria-hidden="true" /><strong>{t("Dein nächster Besuch hat Vorteile.", "Your next visit comes with benefits.")}</strong><p>{t("Aktuelle Aktionen und verfügbare Belohnungen direkt in deiner App.", "Current offers and available rewards, right in your app.")}</p><a href={appUrl}>{t("Vorteile entdecken", "Discover benefits")}<ArrowRight size={16} aria-hidden="true" /></a></div>
        </section>

        <section id="kontakt" className={styles.contact}>
          <div><p className={styles.eyebrow}>{t("Kontakt & Anreise", "Contact & directions")}</p><EditableCopy config={config} id="content.contactHeadline" as="h2">{config.content.contactHeadline}</EditableCopy><div className={styles.contactLinks}>
            {address && <p><MapPin size={18} aria-hidden="true" />{address}</p>}
            {phone && <a href={`tel:${phone}`}><Phone size={18} aria-hidden="true" />{partner.phone}</a>}
            {partner.email && <a href={`mailto:${partner.email}`}>{partner.email}</a>}
            {website && <a href={website} className={styles.textLink}>{copy.action}<ArrowRight size={16} aria-hidden="true" /></a>}
            {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className={styles.textLink}>{t("Route planen", "Get directions")}<Route size={18} aria-hidden="true" /></a>}
            {!phone && !website && !partner.email && <p>{t("Für Fragen zu deinem Besuch wende dich bitte vor Ort an das Team.", "For questions about your visit, please speak to the team at the venue.")}</p>}
          </div></div>
          <div className={styles.hours}><h3><Clock3 size={20} aria-hidden="true" />{t("Öffnungszeiten", "Opening hours")}</h3><OpeningHours partner={partner} language={config.language} /></div>
        </section>
        <section id="faq" className={styles.faq}><h2>{t("Fragen vor deinem Besuch", "Before you visit")}</h2><div>{micrositeFaqItemsForPartner(partner, config).map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></section>
      </div>
      <footer className={styles.footer}><div><strong>{name}</strong><EditableCopy config={config} id="content.footerText">{config.content.footerText}</EditableCopy></div><nav aria-label={t("Footer-Navigation", "Footer navigation")}><a href="#speisekarte">{copy.label}</a><a href="#kontakt">{t("Kontakt", "Contact")}</a><a href="https://benefitsi.de/impressum">{t("Impressum", "Legal notice")}</a><a href="https://benefitsi.de/datenschutz">{t("Datenschutz", "Privacy")}</a></nav><span>Powered by Benefitsi</span></footer>
      {showAppDownloadPopup && <AppDownloadQrPopup partner={partner} config={config} />}
    </article>
  )
}

function OfferingList({ partner, config, Icon, contactHref, action }: { partner: PartnerWithDeals; config: MicrositeConfig; Icon: LucideIcon; contactHref: string; action: string }) {
  const en = config.language === "en"
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState(false)
  const items = useMemo(() => micrositeMenuItemsForPartner(partner, config.elementText), [partner, config.elementText])
  const filtered = items.filter((item) => [item.name, item.description, item.categoryName].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
  const visible = expanded || query ? filtered : micrositeMenuPreviewItems(items, config.elementText["content.menuFeaturedItemKey"], 6)
  if (!items.length) return <div className={styles.availability}><Icon size={34} strokeWidth={1.2} aria-hidden="true" /><div><h3>{en ? "Let's plan your visit." : "Plane deinen nächsten Besuch."}</h3><p>{en ? "Contact the team for the current selection, prices and availability." : "Die aktuelle Auswahl, Preise und Verfügbarkeit erfährst du direkt beim Team."}</p></div><a href={contactHref} className={styles.textLink}>{action}<ArrowRight size={18} aria-hidden="true" /></a></div>
  return <>
    {items.length > 6 && <label className={styles.search}>{en ? "Search the selection" : "Auswahl durchsuchen"}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={en ? "Name or category" : "Name oder Kategorie"} /></label>}
    <div className={styles.offeringList}>{visible.map((item) => <article key={micrositeMenuItemKey(item)} className={styles.offering}>
      {item.image_url && item.micrositeShowImage !== false ? <img {...editable(item.micrositeImageId || "", "image", item.name || "Image")} src={item.image_url} alt={micrositeMenuItemDisplayName(item.name)} loading="lazy" style={imageStyleFor(config, item.micrositeImageId || "")} /> : <div className={styles.offeringIcon}><Icon size={30} strokeWidth={1.2} aria-hidden="true" /></div>}
      <div>{item.categoryName && <p className={styles.eyebrow}>{item.categoryName}</p>}<h3>{micrositeMenuItemDisplayName(item.name)}</h3>{item.description && <p>{item.description}</p>}</div><strong>{formatOfferingPrice(item.price, item.currency, config.language)}</strong>
    </article>)}</div>
    {!visible.length && <p role="status">{en ? "No matching entries. Try another search." : "Keine passenden Einträge. Versuche einen anderen Suchbegriff."}</p>}
    {!query && items.length > 6 && <button className={styles.showMore} type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? (en ? "Show less" : "Weniger anzeigen") : (en ? `View all ${items.length} entries` : `Alle ${items.length} Einträge ansehen`)}</button>}
  </>
}

function formatOfferingPrice(value: number | string | null, currency: string | null, language: "de" | "en") {
  if (value == null || value === "") return language === "en" ? "On request" : "Auf Anfrage"
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  try { return new Intl.NumberFormat(language === "en" ? "en-GB" : "de-DE", { style: "currency", currency: currency || "EUR" }).format(numeric) } catch { return String(value) }
}

function OpeningHours({ partner, language }: { partner: PartnerWithDeals; language: "de" | "en" }) {
  const en = language === "en"
  const days = en ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] : ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]
  const hours = partner.opening_hours.filter((row) => row.weekday !== null)
  if (!hours.length) return <p>{en ? "Please ask the team about current opening and appointment times." : "Aktuelle Öffnungs- und Terminzeiten erfährst du direkt beim Team."}</p>
  const rows: ReactNode[] = [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const entries = hours.filter((row) => row.weekday === day).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const times = entries.filter((row) => !row.is_closed && row.opens_at && row.closes_at).map((row) => `${row.opens_at!.slice(0, 5)}-${row.closes_at!.slice(0, 5)}`)
    const label = times.length ? times.join(" / ") : entries.some((row) => row.is_closed) ? (en ? "Closed" : "Geschlossen") : (en ? "Please enquire" : "Auf Anfrage")
    return <div key={day}><dt>{days[day]}</dt><dd>{label}</dd></div>
  })
  return <><dl>{rows}</dl><p className={styles.hoursNote}>{en ? "Holiday hours and appointment availability may vary. Please confirm with the venue." : "Feiertagszeiten und Terminverfügbarkeit können abweichen. Bitte direkt beim Anbieter prüfen."}</p></>
}

function EditableCopy({ config, id, children, as: Tag = "p", className }: { config: MicrositeConfig; id: string; children: string; as?: "p" | "h1" | "h2"; className?: string }) {
    return <Tag {...editable(id, "text", id)} className={className} style={textStyleFor(config, id)}>{textValue(config, id, children)}</Tag>
  }

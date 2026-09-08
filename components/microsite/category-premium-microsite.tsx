/* eslint-disable @next/next/no-img-element -- Partner-selected assets can use arbitrary storage hosts. */
"use client"

import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowRight,
  BedDouble,
  Car,
  Check,
  Clock3,
  Compass,
  Dumbbell,
  Film,
  Gift,
  Handshake,
  Landmark,
  Leaf,
  MapPin,
  Mountain,
  Phone,
  Route,
  Scissors,
  Search,
  Sun,
  type LucideIcon,
} from "lucide-react"
import type { Deal, PartnerWithDeals } from "@/lib/admin-data"
import type { MicrositeConfig } from "@/lib/microsites"
import {
  categoryThemeContent,
  type CategoryMicrositeTemplateId,
} from "@/lib/microsite-category-themes"
import { partnerSocialUrl } from "@/lib/microsite-personalization"
import { micrositeFaqItemsForPartner } from "@/lib/microsite-seo"
import {
  getMicrositePublicDeals,
  getMicrositeStampRewards,
  micrositeDealDescription,
  micrositeDealDetails,
  micrositeDealTitle,
  micrositeDealTypeLabel,
} from "@/lib/microsite-content"
import { contrastRatio } from "@/lib/logo-palette"
import { isMicrositeTwoForOneDeal, partitionMicrositePublicDeals } from "@/lib/microsite-deals"
import {
  micrositeMenuItemDisplayName,
  micrositeMenuItemKey,
} from "@/lib/microsite-menu"
import {
  AppDownloadQrPopup,
  MicrositeThemeCss,
  appDownloadUrlForPartner,
  editable,
  imageStyleFor,
  micrositeMenuItemsForPartner,
  micrositeThemeVars,
  textStyleFor,
  textValue,
  useResolvedPalette,
} from "./restaurant-premium-microsite"
import styles from "./category-type-microsites.module.css"

const icons: Record<string, LucideIcon> = {
  scissors: Scissors,
  leaf: Leaf,
  bed: BedDouble,
  car: Car,
  route: Route,
  film: Film,
  dumbbell: Dumbbell,
  mountain: Mountain,
  sun: Sun,
  landmark: Landmark,
  handshake: Handshake,
  compass: Compass,
}

type CategoryFamily = "activities" | "wellness" | "services"
type PartnerOffering = ReturnType<typeof micrositeMenuItemsForPartner>[number]

type Props = {
  partner: PartnerWithDeals
  config: MicrositeConfig
  template: CategoryMicrositeTemplateId
  showAppDownloadPopup?: boolean
  showMockDeals?: boolean
}

type MicrositeContext = {
  partner: PartnerWithDeals
  config: MicrositeConfig
  template: CategoryMicrositeTemplateId
  family: CategoryFamily
  copy: ReturnType<typeof categoryThemeContent>
  Icon: LucideIcon
  heroImage: string
  storyImage: string | undefined
  wellnessDetailImage: string
  name: string
  address: string
  phone: string
  website: string
  contactHref: string
  mapUrl: string
  appUrl: string
  hasBenefits: boolean
  showMockDeals: boolean
  showBenefitSection: boolean
}

const activityTemplates = new Set<CategoryMicrositeTemplateId>([
  "cinema-showcase",
  "fitness-club",
  "adventure-play",
  "family-days",
  "culture-discovery",
  "activities-explore",
])

const wellnessTemplates = new Set<CategoryMicrositeTemplateId>([
  "salon-studio",
  "wellness-retreat",
])

function categoryFamilyForPartner(partner: PartnerWithDeals, template: CategoryMicrositeTemplateId): CategoryFamily {
  const type = partner.type?.trim().toLowerCase()
  if (type === "activities") return "activities"
  if (type === "wellness") return "wellness"
  if (type === "services") return "services"
  if (activityTemplates.has(template)) return "activities"
  if (wellnessTemplates.has(template)) return "wellness"
  return "services"
}

function familyCopy(family: CategoryFamily, language: MicrositeConfig["language"]) {
  const english = language === "en"
  const values = {
    activities: {
      kicker: ["Erlebnisse vor Ort", "Local experiences"],
      offeringsTitle: ["Wähle, worauf du heute Lust hast.", "Choose what you feel like doing today."],
      offeringsBody: ["Vergleiche die Möglichkeiten und starte direkt mit deinem nächsten Ausflug.", "Compare the options and start planning your next outing."],
      planTitle: ["Aus freier Zeit wird ein guter Plan.", "Turn free time into a good plan."],
      planBody: ["Details, Zeiten und Voraussetzungen bleiben klar, damit du dich auf den Moment freuen kannst.", "Keep the details, times and requirements clear so you can look forward to the moment."],
      benefitsTitle: ["Mehr aus deinem Besuch machen.", "Make more of your visit."],
      benefitsBody: ["Deine Benefits sitzen dort, wo die Vorfreude beginnt.", "Your benefits sit right where the anticipation starts."],
      storyTitle: ["Ein Ort für gute Geschichten.", "A place for good stories."],
      appTitle: ["Speichere dein nächstes Erlebnis.", "Save your next experience."],
      appBody: ["Finde Vorteile, merke dir Favoriten und plane deinen Besuch in der App.", "Find benefits, save favourites and plan your visit in the app."],
      contactTitle: ["Bereit für den nächsten Termin?", "Ready for your next visit?"],
    },
    wellness: {
      kicker: ["Zeit für dich", "Time for yourself"],
      offeringsTitle: ["Dein persönliches Ritual beginnt hier.", "Your personal ritual starts here."],
      offeringsBody: ["Wähle eine Behandlung und stimme Dauer, Intensität und Wünsche direkt mit dem Team ab.", "Choose a treatment and discuss duration, intensity and preferences with the team."],
      planTitle: ["Langsam ankommen. Tief durchatmen.", "Arrive slowly. Breathe deeply."],
      planBody: ["Eine ruhige Abfolge für Menschen, die ihrem Besuch bewusst Raum geben möchten.", "A calm sequence for people who want to make space for their visit."],
      benefitsTitle: ["Deine Auszeit hat Vorteile.", "Your time out comes with benefits."],
      benefitsBody: ["Entdecke aktuelle Vorteile und belohne regelmäßige Besuche.", "Discover current benefits and make regular visits count."],
      storyTitle: ["Ein Raum, der gut tut.", "A space that feels good."],
      appTitle: ["Deine Ruhe bleibt griffbereit.", "Keep your calm close."],
      appBody: ["Speichere deine Lieblingsbehandlungen und entdecke neue Vorteile in der App.", "Save favourite treatments and discover new benefits in the app."],
      contactTitle: ["Deine Auszeit ist nur eine Anfrage entfernt.", "Your time out is one enquiry away."],
    },
    services: {
      kicker: ["Lokal & verlässlich", "Local and reliable"],
      offeringsTitle: ["Leistungen, die weiterhelfen.", "Services that move things forward."],
      offeringsBody: ["Finde schnell die passende Leistung und kläre die wichtigsten Details direkt beim Anbieter.", "Find the right service quickly and confirm the important details directly with the provider."],
      planTitle: ["Klarheit für den nächsten Schritt.", "Clarity for the next step."],
      planBody: ["Eine übersichtliche Auswahl, klare Anfragen und alle praktischen Informationen an einem Ort.", "A clear selection, direct enquiries and practical information in one place."],
      benefitsTitle: ["Gute Leistungen. Zusätzliche Vorteile.", "Good service. Extra benefits."],
      benefitsBody: ["Nutze deine Benefits dort, wo dein nächster Termin stattfindet.", "Use your benefits where your next appointment happens."],
      storyTitle: ["Nah dran, wenn es zählt.", "Close by when it matters."],
      appTitle: ["Deine lokalen Favoriten an einem Ort.", "Keep your local favourites together."],
      appBody: ["Finde Vorteile, speichere Partner und plane deinen nächsten Besuch mit wenigen Klicks.", "Find benefits, save partners and plan your next visit in a few taps."],
      contactTitle: ["Direkt zum richtigen Kontakt.", "Go straight to the right contact."],
    },
  }[family]

  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value[english ? 1 : 0]])) as Record<keyof typeof values, string>
}

function isHexColour(value: string) {
  return /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)
}

function readableTextOn(background: string) {
  if (!isHexColour(background)) return "#ffffff"
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111827")
    ? "#ffffff"
    : "#111827"
}

function readableAccentOnSurface(accent: string, surface: string, fallback: string) {
  if (!isHexColour(accent) || !isHexColour(surface)) return fallback
  return contrastRatio(accent, surface) >= 4.5 ? accent : fallback
}

export function CategoryPremiumMicrosite({ partner, config, template, showAppDownloadPopup = true, showMockDeals = false }: Props) {
  const copy = categoryThemeContent(partner, template, config.language)
  const family = categoryFamilyForPartner(partner, template)
  const familyText = familyCopy(family, config.language)
  const en = config.language === "en"
  const t = (de: string, english: string) => (en ? english : de)
  const Icon = icons[copy.theme.icon] || Compass
  const logo = config.branding.logoUrl || partner.logo_url || ""
  const palette = useResolvedPalette(config, logo)
  const automaticWithoutLogo = config.branding.paletteMode === "auto" && !logo
  const resolvedAccent = automaticWithoutLogo ? copy.theme.accent : palette.primary
  const resolvedSecondary = automaticWithoutLogo ? copy.theme.secondary : palette.secondary
  const siteBackground = config.appearance.mode === "dark" ? "#101216" : "#f4f8fc"
  const readableFallback = config.appearance.mode === "dark" ? "#ffffff" : "#111827"
  const secondaryInk = readableTextOn(resolvedSecondary)
  const readableAccent = readableAccentOnSurface(
    resolvedAccent,
    siteBackground,
    readableAccentOnSurface(resolvedSecondary, siteBackground, readableFallback),
  )
  const style = {
    ...micrositeThemeVars(config),
    "--site-accent": resolvedAccent,
    "--site-secondary": resolvedSecondary,
    "--site-tertiary": automaticWithoutLogo ? copy.theme.accent : palette.tertiary,
    "--category-on-secondary": secondaryInk,
    "--category-on-accent": readableTextOn(resolvedAccent),
    "--category-readable-accent": readableAccent,
    "--category-accent-on-secondary": readableAccentOnSurface(resolvedAccent, resolvedSecondary, secondaryInk),
  } as CSSProperties
  const heroImage = config.hero.backgroundImageUrl !== "/upload-image.jpg" ? config.hero.backgroundImageUrl : ""
  const name = partner.name || config.hero.headline
  const website = partnerSocialUrl(partner, "website")
  const phone = partner.phone?.replace(/[^\d+]/g, "") || ""
  const contactHref = website || (phone ? `tel:${phone}` : "#kontakt")
  const address = partner.address || partner.city_name || ""
  const mapUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : ""
  const appUrl = textValue(config, "content.appDownloadUrl", appDownloadUrlForPartner(partner))
  const configuredStoryImage = config.elementText["content.aboutHeroImageUrl"]?.trim()
  const storyImage = configuredStoryImage || partner.cover_urls?.find((url) => url !== heroImage)
  const wellnessDetailImage = config.elementText["content.wellnessHeroDetailImageUrl"]?.trim() || ""
  const hasBenefits = getMicrositePublicDeals(partner.deals).length > 0 || getMicrositeStampRewards(partner.reward_milestones).length > 0
  const showBenefitSection = hasBenefits || showMockDeals
  const context: MicrositeContext = { partner, config, template, family, copy, Icon, heroImage, storyImage, wellnessDetailImage, name, address, phone, website, contactHref, mapUrl, appUrl, hasBenefits, showMockDeals, showBenefitSection }

  return <article lang={config.language} style={style} data-template={template} data-family={family} className={`premium-microsite @container ${styles.site} ${config.appearance.mode === "dark" ? "premium-microsite-dark" : ""}`}>
    <MicrositeThemeCss />
    <a className={styles.skipLink} href="#partner-content">{t("Zum Inhalt", "Skip to content")}</a>
    <CategoryHeader context={context} />
    <main id="partner-content">
      {template === "salon-studio" ? <SalonTemplate context={context} familyText={familyText} /> : null}
      {template === "cinema-showcase" ? <CinemaTemplate context={context} familyText={familyText} /> : null}
      {family === "activities" && template !== "cinema-showcase" ? <ActivitiesTemplate context={context} familyText={familyText} /> : null}
      {family === "wellness" && template !== "salon-studio" ? <WellnessTemplate context={context} familyText={familyText} /> : null}
      {family === "services" ? <ServicesTemplate context={context} familyText={familyText} /> : null}
    </main>
    <CategoryFooter context={context} />
    {showAppDownloadPopup ? <AppDownloadQrPopup partner={partner} config={config} /> : null}
  </article>
}

function CategoryHeader({ context }: { context: MicrositeContext }) {
  const { partner, config, family, name, showBenefitSection } = context
  const [menuOpen, setMenuOpen] = useState(false)
  const links = config.navigation.links.filter((link) => showBenefitSection || !["deals", "stempelkarte"].includes(link.anchor))
  const logo = config.branding.logoUrl || partner.logo_url || "/Benefitsi_Icon_FullColor_RGB_512.png"
  return <header className={styles.header} data-family={family}><div className={styles.headerInner}>
    <a href="#partner-content" className={styles.brand} aria-label={name}><img {...editable("branding.logo", "image", "Partnerlogo")} src={logo} alt="" width={42} height={42} style={imageStyleFor(config, "branding.logo")} /><span>{name}</span></a>
    <nav className={styles.desktopNav} aria-label={config.language === "en" ? "Microsite navigation" : "Microsite-Navigation"}>{links.map((link) => <a key={link.anchor} {...editable(`navigation.${link.anchor}`, "text", `Navigation ${link.label}`)} href={`#${link.anchor}`} style={textStyleFor(config, `navigation.${link.anchor}`)}>{textValue(config, `navigation.${link.anchor}`, link.label)}</a>)}</nav>
    <a className={styles.headerCta} href={showBenefitSection ? "#deals" : "#speisekarte"}><span {...editable(showBenefitSection ? "hero.primaryButtonLabel" : "hero.secondaryButtonLabel", "text", "Navigation CTA")} style={textStyleFor(config, showBenefitSection ? "hero.primaryButtonLabel" : "hero.secondaryButtonLabel")}>{showBenefitSection ? config.hero.primaryButtonLabel : config.hero.secondaryButtonLabel}</span><ArrowRight size={16} aria-hidden="true" /></a>
    <button className={styles.menuButton} type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="category-mobile-navigation" aria-label={config.language === "en" ? "Open navigation" : "Navigation öffnen"}><span aria-hidden="true">{menuOpen ? "×" : "☰"}</span></button>
    {menuOpen ? <nav id="category-mobile-navigation" className={styles.mobileNav} aria-label={config.language === "en" ? "Mobile navigation" : "Mobile Navigation"}>{links.map((link) => <a key={link.anchor} href={`#${link.anchor}`} onClick={() => setMenuOpen(false)}>{textValue(config, `navigation.${link.anchor}`, link.label)}</a>)}</nav> : null}
  </div></header>
}

function CategoryHero({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  if (context.family === "wellness") return <WellnessHero context={context} familyText={familyText} />
  if (context.family === "activities") return <ActivitiesHero context={context} familyText={familyText} />
  return <ServicesHero context={context} familyText={familyText} />
}

function HeroImage({ context, className }: { context: MicrositeContext; className: string }) {
  const { config, heroImage, name, Icon, copy } = context
  const label = config.language === "en" ? "Hero image" : "Startbild"

  return heroImage ? (
    <img
      {...editable("hero.backgroundImageUrl", "image", label)}
      src={heroImage}
      alt={name}
      style={imageStyleFor(config, "hero.backgroundImageUrl")}
      fetchPriority="high"
      className={className}
    />
  ) : (
    <div className={`${styles.heroFallback} ${className}`}>
      <Icon strokeWidth={0.8} aria-hidden="true" />
      <span>{copy.label}</span>
    </div>
  )
}

function ActivitiesHero({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, copy, Icon, name, address, showBenefitSection } = context
  const t = (de: string, english: string) => (config.language === "en" ? english : de)

  return (
    <section className={styles.activitiesHero} aria-label={name}>
      <div className={styles.activitiesHeroCopy}>
        <p className={styles.heroEyebrow}>
          <Icon size={17} aria-hidden="true" />
          <span {...editable("category.heroKicker", "text", "Hero Kicker")} style={textStyleFor(config, "category.heroKicker")}>
            {normalizeCategoryText(textValue(config, "category.heroKicker", familyText.kicker))}
          </span>
        </p>
        <EditableCopy config={config} id="hero.headline" as="h1">{config.hero.headline}</EditableCopy>
        <EditableCopy config={config} id="hero.slogan" className={styles.activitiesHeroSlogan}>{config.hero.slogan}</EditableCopy>
        <div className={styles.activitiesHeroActions}>
          <a className={styles.activitiesHeroPrimary} href={context.contactHref}>
            <span {...editable("category.heroAction", "text", "Hero Aktion")} style={textStyleFor(config, "category.heroAction")}>
              {textValue(config, "category.heroAction", copy.action)}
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </a>
          {showBenefitSection ? <a className={styles.activitiesHeroBenefits} href="#deals"><Gift size={15} aria-hidden="true" />{config.hero.primaryButtonLabel}</a> : null}
        </div>
        <p className={styles.activitiesHeroNote}>{copy.note}</p>
      </div>
      <div className={styles.activitiesHeroStage} data-template={context.template}>
        <HeroImage context={context} className={styles.activitiesHeroImage} />
        <div className={styles.activitiesHeroRoute} aria-hidden="true"><span /><span /><span /></div>
        <a className={styles.activitiesHeroPass} href="#speisekarte">
          <span>01</span><strong>{copy.label}</strong><ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
      <div className={styles.activitiesHeroMeta}>
        <span>{address || t("Dein Erlebnis vor Ort", "Your local experience")}</span>
        <span>{t("Auswählen · planen · losgehen", "Choose · plan · go")}</span>
      </div>
    </section>
  )
}

function WellnessHero({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, copy, Icon, name, address, showBenefitSection, wellnessDetailImage } = context
  const t = (de: string, english: string) => (config.language === "en" ? english : de)

  return (
    <section className={styles.wellnessHero} aria-label={name}>
      <div className={styles.wellnessHeroIndex} aria-hidden="true"><span>01</span><i /> <span>04</span></div>
      <div className={styles.wellnessHeroCopy}>
        <p className={styles.wellnessHeroKicker}>
          <Leaf size={16} aria-hidden="true" />
          <span {...editable("category.heroKicker", "text", "Hero Kicker")} style={textStyleFor(config, "category.heroKicker")}>
            {normalizeCategoryText(textValue(config, "category.heroKicker", familyText.kicker))}
          </span>
        </p>
        <EditableCopy config={config} id="hero.headline" as="h1">{config.hero.headline}</EditableCopy>
        <EditableCopy config={config} id="hero.slogan" className={styles.wellnessHeroSlogan}>{config.hero.slogan}</EditableCopy>
        <p className={styles.wellnessHeroNote}>{copy.note}</p>
        <div className={styles.wellnessHeroActions}>
          <a className={styles.wellnessHeroPrimary} href={context.contactHref}>
            <span {...editable("category.heroAction", "text", "Hero Aktion")} style={textStyleFor(config, "category.heroAction")}>
              {textValue(config, "category.heroAction", copy.action)}
            </span>
            <ArrowRight size={17} aria-hidden="true" />
          </a>
          {showBenefitSection ? <a className={styles.wellnessHeroBenefits} href="#deals">{config.hero.primaryButtonLabel}<Gift size={15} aria-hidden="true" /></a> : null}
        </div>
      </div>
      <div className={styles.wellnessHeroArt} data-template={context.template}>
        <div className={styles.wellnessHeroMedia}><HeroImage context={context} className={styles.wellnessHeroImage} /></div>
        <span className={styles.wellnessHeroMeasure} aria-hidden="true" />
        <div className={styles.wellnessHeroLabel} aria-hidden="true"><Icon size={21} strokeWidth={1.1} /><span>{copy.label}</span><i>01 / 04</i></div>
        {wellnessDetailImage ? <img {...editable("content.wellnessHeroDetailImageUrl", "image", "Wellness Hero Detailbild")} className={styles.wellnessHeroDetail} src={wellnessDetailImage} alt="" loading="lazy" style={imageStyleFor(config, "content.wellnessHeroDetailImageUrl")} /> : null}
      </div>
      <div className={styles.wellnessHeroFoot}>
        <span>{address || t("Zeit für deinen Körper", "Time for your body")}</span>
        <span>{t("Ankommen · loslassen · aufatmen", "Arrive · unwind · exhale")}</span>
      </div>
    </section>
  )
}

function SalonHero({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, copy, name, address, showBenefitSection } = context
  const t = (de: string, english: string) => (config.language === "en" ? english : de)

  return (
    <section className={styles.salonHero} aria-label={name}>
      <div className={styles.salonHeroCopy}>
        <p className={styles.salonHeroKicker}>
          <Scissors size={17} aria-hidden="true" />
          <span {...editable("category.heroKicker", "text", "Hero Kicker")} style={textStyleFor(config, "category.heroKicker")}>
            {normalizeCategoryText(textValue(config, "category.heroKicker", familyText.kicker))}
          </span>
        </p>
        <EditableCopy config={config} id="hero.headline" as="h1">{config.hero.headline}</EditableCopy>
        <EditableCopy config={config} id="hero.slogan" className={styles.salonHeroSlogan}>{config.hero.slogan}</EditableCopy>
        <p className={styles.salonHeroNote}>{copy.note}</p>
        <div className={styles.salonHeroActions}>
          <a className={styles.salonHeroPrimary} href={context.contactHref}>
            <span {...editable("category.heroAction", "text", "Hero Aktion")} style={textStyleFor(config, "category.heroAction")}>
              {textValue(config, "category.heroAction", copy.action)}
            </span>
            <ArrowRight size={17} aria-hidden="true" />
          </a>
          {showBenefitSection ? <a className={styles.salonHeroBenefits} href="#deals">{config.hero.primaryButtonLabel}<Gift size={15} aria-hidden="true" /></a> : null}
        </div>
        <div className={styles.salonHeroDetails}>
          <span>{address || t("Persönliche Beratung im Studio", "Personal consultation in studio")}</span>
          <span>{t("Schnitt · Farbe · Pflege", "Cut · colour · care")}</span>
        </div>
      </div>
      <div className={styles.salonHeroLookbook}>
        <div className={styles.salonHeroImageFrame}><HeroImage context={context} className={styles.salonHeroImage} /></div>
        <div className={styles.salonHeroCard} aria-hidden="true"><span>Studio note</span><strong>{copy.label}</strong><i>01 — 01</i></div>
        <div className={styles.salonHeroSwatches} aria-hidden="true"><i /><i /><i /></div>
      </div>
    </section>
  )
}

function CinemaHero({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, copy, name, address, showBenefitSection } = context
  const t = (de: string, english: string) => (config.language === "en" ? english : de)

  return (
    <section className={styles.cinemaHero} aria-label={name}>
      <div className={styles.cinemaHeroCopy}>
        <p className={styles.cinemaHeroKicker}><Film size={17} aria-hidden="true" /><span {...editable("category.heroKicker", "text", "Hero Kicker")} style={textStyleFor(config, "category.heroKicker")}>{normalizeCategoryText(textValue(config, "category.heroKicker", familyText.kicker))}</span></p>
        <EditableCopy config={config} id="hero.headline" as="h1">{config.hero.headline}</EditableCopy>
        <EditableCopy config={config} id="hero.slogan" className={styles.cinemaHeroSlogan}>{config.hero.slogan}</EditableCopy>
        <div className={styles.cinemaHeroActions}>
          <a className={styles.cinemaHeroPrimary} href={context.contactHref}><span {...editable("category.heroAction", "text", "Hero Aktion")} style={textStyleFor(config, "category.heroAction")}>{textValue(config, "category.heroAction", copy.action)}</span><ArrowRight size={17} aria-hidden="true" /></a>
          {showBenefitSection ? <a className={styles.cinemaHeroBenefits} href="#deals">{config.hero.primaryButtonLabel}</a> : null}
        </div>
      </div>
      <div className={styles.cinemaHeroScreen}>
        <div className={styles.cinemaHeroScreenTop}><span>Now showing</span><span>01 / 01</span></div>
        <HeroImage context={context} className={styles.cinemaHeroImage} />
        <div className={styles.cinemaHeroScreenBottom}><strong>{copy.label}</strong><span>{address || t("Programm direkt beim Kino", "Programme directly from the cinema")}</span></div>
      </div>
      <div className={styles.cinemaHeroMarquee} aria-hidden="true"><span>{t("Filmabend · Popcorn · große Leinwand", "Movie night · popcorn · the big screen")}</span><span>{t("Filmabend · Popcorn · große Leinwand", "Movie night · popcorn · the big screen")}</span></div>
    </section>
  )
}

function ServicesHero({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, copy, Icon, name, address, showBenefitSection } = context
  const t = (de: string, english: string) => (config.language === "en" ? english : de)

  return (
    <section className={styles.servicesHero} aria-label={name}>
      <div className={styles.servicesHeroTitle}>
        <p className={styles.heroEyebrow}><Handshake size={16} aria-hidden="true" /><span {...editable("category.heroKicker", "text", "Hero Kicker")} style={textStyleFor(config, "category.heroKicker")}>{normalizeCategoryText(textValue(config, "category.heroKicker", familyText.kicker))}</span></p>
        <EditableCopy config={config} id="hero.headline" as="h1">{config.hero.headline}</EditableCopy>
        <EditableCopy config={config} id="hero.slogan" className={styles.servicesHeroSlogan}>{config.hero.slogan}</EditableCopy>
        <div className={styles.servicesHeroActions}><a className={styles.servicesHeroPrimary} href={context.contactHref}><span {...editable("category.heroAction", "text", "Hero Aktion")} style={textStyleFor(config, "category.heroAction")}>{textValue(config, "category.heroAction", copy.action)}</span><ArrowRight size={17} aria-hidden="true" /></a>{showBenefitSection ? <a href="#deals">{config.hero.primaryButtonLabel}</a> : null}</div>
      </div>
      <div className={styles.servicesHeroBrief}>
        <div className={styles.servicesHeroMedia} data-template={context.template}><HeroImage context={context} className={styles.servicesHeroImage} /><span aria-hidden="true">{copy.label}</span></div>
        <div className={styles.servicesHeroFacts}>
          <div><MapPin size={16} aria-hidden="true" /><span>{address || t("Lokal erreichbar", "Available locally")}</span></div>
          <div><Clock3 size={16} aria-hidden="true" /><span {...editable("hero.openingText", "text", "Öffnungszeiten")} style={textStyleFor(config, "hero.openingText")}>{normalizeCategoryText(config.hero.openingText) || t("Direkt beim Team anfragen", "Ask the team directly")}</span></div>
          <div><Icon size={16} aria-hidden="true" /><span>{copy.note}</span></div>
        </div>
      </div>
    </section>
  )
}

function ActivitiesTemplate({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, partner, copy } = context
  const items = useMemo(() => micrositeMenuItemsForPartner(partner, config.elementText), [partner, config.elementText])
  return <><CategoryHero context={context} familyText={familyText} /><section id="speisekarte" className={`${styles.explorer} ${styles.activitiesBlock}`} data-family="activities"><SectionIntro config={config} title={textValue(config, "content.menuHeadline", familyText.offeringsTitle)} body={textValue(config, "content.menuDescription", familyText.offeringsBody)} accent={textValue(config, "content.menuLabel", copy.label)} /><ActivityDeck items={items} context={context} /></section><JourneySection context={context} familyText={familyText} /><CategoryBenefits context={context} familyText={familyText} /><CategoryStory context={context} familyText={familyText} /><CategoryAppPrompt context={context} familyText={familyText} /><CategoryContact context={context} familyText={familyText} /><CategoryFaq context={context} /></>
}

function WellnessTemplate({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, partner, copy } = context
  const items = useMemo(() => micrositeMenuItemsForPartner(partner, config.elementText), [partner, config.elementText])
  return <><CategoryHero context={context} familyText={familyText} /><section id="speisekarte" className={`${styles.rituals} ${styles.wellnessBlock}`} data-family="wellness"><SectionIntro config={config} title={textValue(config, "content.menuHeadline", familyText.offeringsTitle)} body={textValue(config, "content.menuDescription", familyText.offeringsBody)} accent={textValue(config, "content.menuLabel", copy.label)} /><RitualDeck items={items} context={context} /></section><WellnessFlow context={context} familyText={familyText} /><CategoryBenefits context={context} familyText={familyText} /><CategoryStory context={context} familyText={familyText} /><CategoryAppPrompt context={context} familyText={familyText} /><CategoryContact context={context} familyText={familyText} /><CategoryFaq context={context} /></>
}

function SalonTemplate({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, partner, copy } = context
  const items = useMemo(() => micrositeMenuItemsForPartner(partner, config.elementText), [partner, config.elementText])

  return <><SalonHero context={context} familyText={familyText} /><section id="speisekarte" className={styles.salonServices}><SectionIntro config={config} title={textValue(config, "content.menuHeadline", familyText.offeringsTitle)} body={textValue(config, "content.menuDescription", familyText.offeringsBody)} accent={textValue(config, "content.menuLabel", copy.label)} /><SalonServiceBook items={items} context={context} /></section><SalonConsultation context={context} familyText={familyText} /><CategoryBenefits context={context} familyText={familyText} /><CategoryStory context={context} familyText={familyText} /><CategoryAppPrompt context={context} familyText={familyText} /><CategoryContact context={context} familyText={familyText} /><CategoryFaq context={context} /></>
}

function CinemaTemplate({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, partner, copy } = context
  const items = useMemo(() => micrositeMenuItemsForPartner(partner, config.elementText), [partner, config.elementText])

  return <><CinemaHero context={context} familyText={familyText} /><section id="speisekarte" className={styles.cinemaProgramme}><SectionIntro config={config} title={textValue(config, "content.menuHeadline", familyText.offeringsTitle)} body={textValue(config, "content.menuDescription", familyText.offeringsBody)} accent={textValue(config, "content.menuLabel", copy.label)} /><CinemaProgramme items={items} context={context} /></section><CinemaVisitGuide context={context} familyText={familyText} /><CategoryBenefits context={context} familyText={familyText} /><CategoryStory context={context} familyText={familyText} /><CategoryAppPrompt context={context} familyText={familyText} /><CategoryContact context={context} familyText={familyText} /><CategoryFaq context={context} /></>
}

function ServicesTemplate({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, partner, copy } = context
  const items = useMemo(() => micrositeMenuItemsForPartner(partner, config.elementText), [partner, config.elementText])
  return <><CategoryHero context={context} familyText={familyText} /><section id="speisekarte" className={`${styles.services} ${styles.servicesBlock}`} data-family="services"><SectionIntro config={config} title={textValue(config, "content.menuHeadline", familyText.offeringsTitle)} body={textValue(config, "content.menuDescription", familyText.offeringsBody)} accent={textValue(config, "content.menuLabel", copy.label)} /><ServiceFinder items={items} context={context} /></section><ServicePlan context={context} familyText={familyText} /><CategoryBenefits context={context} familyText={familyText} /><CategoryStory context={context} familyText={familyText} /><CategoryAppPrompt context={context} familyText={familyText} /><CategoryContact context={context} familyText={familyText} /><CategoryFaq context={context} /></>
}

function SectionIntro({ config, title, body, accent }: { config: MicrositeConfig; title: string; body: string; accent: string }) { return <div className={styles.sectionIntro}><p {...editable("content.menuLabel", "text", "Leistungsbereich Label")} style={textStyleFor(config, "content.menuLabel")}>{normalizeCategoryText(accent)}</p><h2 {...editable("content.menuHeadline", "text", "Leistungsbereich Überschrift")} style={textStyleFor(config, "content.menuHeadline")}>{normalizeCategoryText(title)}</h2><span {...editable("content.menuDescription", "text", "Leistungsbereich Beschreibung")} style={textStyleFor(config, "content.menuDescription")}>{normalizeCategoryText(body)}</span></div> }

function ActivityDeck({ items, context }: { items: PartnerOffering[]; context: MicrositeContext }) {
  const { config, copy, contactHref, Icon } = context
  const [activeKey, setActiveKey] = useState(items[0] ? micrositeMenuItemKey(items[0]) : "")
  const [showAll, setShowAll] = useState(false)
  const visibleItems = showAll ? items : items.slice(0, 6)
  const active = items.find((item) => micrositeMenuItemKey(item) === activeKey) || items[0]
  if (!items.length) return <EmptyOfferings context={context} />
  return <div className={styles.activityDeck}><div className={styles.activityRail} role="tablist" aria-label={config.language === "en" ? "Experiences" : "Erlebnisse"}>{visibleItems.map((item) => { const key = micrositeMenuItemKey(item); return <button key={key} type="button" role="tab" aria-selected={key === micrositeMenuItemKey(active)} className={key === micrositeMenuItemKey(active) ? styles.activityTabActive : styles.activityTab} onClick={() => setActiveKey(key)}><span>{item.categoryName || copy.label}</span><strong>{micrositeMenuItemDisplayName(item.name)}</strong><ArrowRight size={15} aria-hidden="true" /></button> })}{items.length > 6 ? <button className={styles.moreButton} type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? (config.language === "en" ? "Show fewer" : "Weniger anzeigen") : (config.language === "en" ? `Show all ${items.length}` : `Alle ${items.length} anzeigen`)}</button> : null}</div><article className={styles.activityFeature}>{active?.image_url && active.micrositeShowImage !== false ? <img {...(active.micrositeImageId ? editable(active.micrositeImageId, "image", "Leistungsbild") : {})} src={active.image_url} alt={micrositeMenuItemDisplayName(active.name)} style={imageStyleFor(config, active.micrositeImageId || "")} /> : <div className={styles.featureFallback}><Icon size={54} strokeWidth={1} aria-hidden="true" /></div>}<div className={styles.featureCopy}><p>{active?.categoryName || copy.label}</p><h3>{active ? micrositeMenuItemDisplayName(active.name) : copy.label}</h3><span>{active?.description || (config.language === "en" ? "Ask the team for details and availability." : "Frage das Team nach Details und Verfügbarkeit.")}</span><div><strong>{active ? formatOfferingPrice(active.price, active.currency, config.language) : ""}</strong><a href={contactHref}>{copy.action}<ArrowRight size={16} aria-hidden="true" /></a></div></div></article></div>
}

function RitualDeck({ items, context }: { items: PartnerOffering[]; context: MicrositeContext }) {
  const { config, copy, contactHref, Icon } = context
  const [activeIndex, setActiveIndex] = useState(0)
  if (!items.length) return <EmptyOfferings context={context} />
  const active = items[Math.min(activeIndex, items.length - 1)]
  return <div className={styles.ritualDeck}><div className={styles.ritualList} role="tablist" aria-label={config.language === "en" ? "Treatments" : "Behandlungen"}>{items.slice(0, 6).map((item, index) => <button key={micrositeMenuItemKey(item)} type="button" role="tab" aria-selected={activeIndex === index} className={activeIndex === index ? styles.ritualTabActive : styles.ritualTab} onClick={() => setActiveIndex(index)}><span>0{index + 1}</span><strong>{micrositeMenuItemDisplayName(item.name)}</strong><ArrowRight size={15} aria-hidden="true" /></button>)}</div><article className={styles.ritualFeature}><div className={styles.ritualImage}>{active.image_url && active.micrositeShowImage !== false ? <img {...(active.micrositeImageId ? editable(active.micrositeImageId, "image", "Behandlungsbild") : {})} src={active.image_url} alt={micrositeMenuItemDisplayName(active.name)} style={imageStyleFor(config, active.micrositeImageId || "")} /> : <Icon size={56} strokeWidth={1} aria-hidden="true" />}</div><div><p>{active.categoryName || copy.label}</p><h3>{micrositeMenuItemDisplayName(active.name)}</h3><span>{active.description || (config.language === "en" ? "Discuss the right duration and intensity with the team." : "Besprich Dauer und Intensität direkt mit dem Team.")}</span><div className={styles.ritualMeta}><strong>{formatOfferingPrice(active.price, active.currency, config.language)}</strong><a href={contactHref}>{copy.action}<ArrowRight size={16} aria-hidden="true" /></a></div></div></article></div>
}

function SalonServiceBook({ items, context }: { items: PartnerOffering[]; context: MicrositeContext }) {
  const { config, copy, contactHref, Icon } = context
  const [activeKey, setActiveKey] = useState(items[0] ? micrositeMenuItemKey(items[0]) : "")
  if (!items.length) return <EmptyOfferings context={context} />
  const active = items.find((item) => micrositeMenuItemKey(item) === activeKey) || items[0]

  return <div className={styles.salonServiceBook}>
    <div className={styles.salonServiceList} role="tablist" aria-label={config.language === "en" ? "Studio services" : "Studioleistungen"}>
      {items.slice(0, 7).map((item, index) => {
        const key = micrositeMenuItemKey(item)
        const selected = key === micrositeMenuItemKey(active)
        return <button key={key} type="button" role="tab" aria-selected={selected} className={selected ? styles.salonServiceTabActive : styles.salonServiceTab} onClick={() => setActiveKey(key)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{micrositeMenuItemDisplayName(item.name)}</strong><i>{selected ? "selected" : item.categoryName || copy.label}</i></button>
      })}
    </div>
    <article className={styles.salonServiceFeature}>
      <div className={styles.salonServiceImage}>
        {active.image_url && active.micrositeShowImage !== false ? <img {...(active.micrositeImageId ? editable(active.micrositeImageId, "image", "Studio Leistungsbild") : {})} src={active.image_url} alt={micrositeMenuItemDisplayName(active.name)} style={imageStyleFor(config, active.micrositeImageId || "")} /> : <Icon size={54} strokeWidth={1} aria-hidden="true" />}
      </div>
      <div className={styles.salonServiceCopy}>
        <p>{active.categoryName || copy.label}</p>
        <h3>{micrositeMenuItemDisplayName(active.name)}</h3>
        <span>{active.description || (config.language === "en" ? "Discuss the right finish, duration and details with the studio." : "Besprich Finish, Dauer und Details direkt mit dem Studio.")}</span>
        <div><strong>{formatOfferingPrice(active.price, active.currency, config.language)}</strong><a href={contactHref}>{copy.action}<ArrowRight size={16} aria-hidden="true" /></a></div>
      </div>
    </article>
  </div>
}

function CinemaProgramme({ items, context }: { items: PartnerOffering[]; context: MicrositeContext }) {
  const { config, copy, contactHref, Icon } = context
  const [activeKey, setActiveKey] = useState(items[0] ? micrositeMenuItemKey(items[0]) : "")
  if (!items.length) return <EmptyOfferings context={context} />
  const active = items.find((item) => micrositeMenuItemKey(item) === activeKey) || items[0]

  return <div className={styles.cinemaProgrammeGrid}>
    <div className={styles.cinemaFilmList} role="tablist" aria-label={config.language === "en" ? "Programme entries" : "Programmeinträge"}>
      {items.slice(0, 8).map((item, index) => {
        const key = micrositeMenuItemKey(item)
        const selected = key === micrositeMenuItemKey(active)
        return <button key={key} type="button" role="tab" aria-selected={selected} className={selected ? styles.cinemaFilmTabActive : styles.cinemaFilmTab} onClick={() => setActiveKey(key)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{micrositeMenuItemDisplayName(item.name)}</strong><Film size={15} aria-hidden="true" /></button>
      })}
    </div>
    <article className={styles.cinemaFilmFeature}>
      <div className={styles.cinemaFilmPoster}>{active.image_url && active.micrositeShowImage !== false ? <img {...(active.micrositeImageId ? editable(active.micrositeImageId, "image", "Programm Bild") : {})} src={active.image_url} alt={micrositeMenuItemDisplayName(active.name)} style={imageStyleFor(config, active.micrositeImageId || "")} /> : <Icon size={58} strokeWidth={.9} aria-hidden="true" />}</div>
      <div className={styles.cinemaFilmCopy}><p>{active.categoryName || copy.label}</p><h3>{micrositeMenuItemDisplayName(active.name)}</h3><span>{active.description || (config.language === "en" ? "Ask the cinema for current times, language versions and tickets." : "Aktuelle Zeiten, Sprachfassungen und Tickets erfährst du direkt beim Kino.")}</span><div className={styles.cinemaFilmMeta}><strong>{formatOfferingPrice(active.price, active.currency, config.language)}</strong><em>{config.language === "en" ? "Times at the venue" : "Zeiten direkt beim Kino"}</em></div><a href={contactHref}>{copy.action}<ArrowRight size={16} aria-hidden="true" /></a></div>
    </article>
  </div>
}

function ServiceFinder({ items, context }: { items: PartnerOffering[]; context: MicrositeContext }) {
  const { config, copy, contactHref, Icon } = context
  const [query, setQuery] = useState("")
  const filtered = items.filter((item) => [item.name, item.description, item.categoryName].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
  if (!items.length) return <EmptyOfferings context={context} />
  return <div className={styles.serviceFinder}><label className={styles.serviceSearch}><Search size={16} aria-hidden="true" /><span className="sr-only">{config.language === "en" ? "Search services" : "Leistungen durchsuchen"}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={config.language === "en" ? "Search services" : "Leistung suchen"} /></label><div className={styles.serviceRows}>{filtered.map((item) => <article key={micrositeMenuItemKey(item)} className={styles.serviceRow}>{item.image_url && item.micrositeShowImage !== false ? <img {...(item.micrositeImageId ? editable(item.micrositeImageId, "image", "Leistungsbild") : {})} src={item.image_url} alt="" style={imageStyleFor(config, item.micrositeImageId || "")} /> : <div className={styles.serviceIcon}><Icon size={25} strokeWidth={1.4} aria-hidden="true" /></div>}<div><p>{item.categoryName || copy.label}</p><h3>{micrositeMenuItemDisplayName(item.name)}</h3><span>{item.description || (config.language === "en" ? "Confirm availability and details with the team." : "Verfügbarkeit und Details direkt mit dem Team klären.")}</span></div><strong>{formatOfferingPrice(item.price, item.currency, config.language)}</strong><a href={contactHref} aria-label={`${copy.action}: ${micrositeMenuItemDisplayName(item.name)}`}><ArrowRight size={18} aria-hidden="true" /></a></article>)}</div>{!filtered.length ? <p className={styles.emptySearch}>{config.language === "en" ? "No matching services." : "Keine passende Leistung gefunden."}</p> : null}</div>
}

function EmptyOfferings({ context }: { context: MicrositeContext }) { const { config, copy, contactHref, Icon } = context; return <div className={styles.emptyOfferings}><Icon size={30} strokeWidth={1.2} aria-hidden="true" /><div><h3>{config.language === "en" ? "Plan your visit with the team." : "Plane deinen Besuch direkt mit dem Team."}</h3><p>{config.language === "en" ? "Current options, prices and availability are available on request." : "Die aktuelle Auswahl, Preise und Verfügbarkeit erfährst du direkt beim Team."}</p></div><a href={contactHref}>{copy.action}<ArrowRight size={16} aria-hidden="true" /></a></div> }

function JourneySection({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) { const { config, copy } = context; return <section className={`${styles.journey} ${styles.activitiesJourney}`} data-family="activities"><div><p>{copy.label}</p><EditableCopy config={config} id="category.planHeadline" as="h2">{textValue(config, "category.planHeadline", familyText.planTitle)}</EditableCopy><EditableCopy config={config} id="category.planText">{textValue(config, "category.planText", familyText.planBody)}</EditableCopy></div><ol>{copy.planning.map((step, index) => <li key={step}><b>0{index + 1}</b><EditableCopy config={config} id={`category.planStep.${index}`}>{textValue(config, `category.planStep.${index}`, step)}</EditableCopy><ArrowRight size={17} aria-hidden="true" /></li>)}</ol></section> }

function WellnessFlow({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) { const { config, copy } = context; return <section className={`${styles.wellnessFlow} ${styles.wellnessJourney}`} data-family="wellness"><div className={styles.flowOrb} aria-hidden="true"><Leaf size={42} strokeWidth={1} /></div><div><p>{copy.label}</p><EditableCopy config={config} id="category.planHeadline" as="h2">{textValue(config, "category.planHeadline", familyText.planTitle)}</EditableCopy><EditableCopy config={config} id="category.planText">{textValue(config, "category.planText", familyText.planBody)}</EditableCopy></div><ol>{copy.planning.map((step, index) => <li key={step}><b>0{index + 1}</b><EditableCopy config={config} id={`category.planStep.${index}`}>{textValue(config, `category.planStep.${index}`, step)}</EditableCopy></li>)}</ol></section> }

function SalonConsultation({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, copy } = context
  return <section className={styles.salonConsultation}><div><p>{copy.label}</p><EditableCopy config={config} id="category.planHeadline" as="h2">{textValue(config, "category.planHeadline", familyText.planTitle)}</EditableCopy><EditableCopy config={config} id="category.planText">{textValue(config, "category.planText", familyText.planBody)}</EditableCopy></div><ol>{copy.planning.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{index === 0 ? "consult" : index === 1 ? "shape" : "finish"}</small><EditableCopy config={config} id={`category.planStep.${index}`}>{textValue(config, `category.planStep.${index}`, step)}</EditableCopy></div><Scissors size={15} aria-hidden="true" /></li>)}</ol></section>
}

function CinemaVisitGuide({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, copy } = context
  return <section className={styles.cinemaVisitGuide}><div><p>{copy.label}</p><EditableCopy config={config} id="category.planHeadline" as="h2">{textValue(config, "category.planHeadline", familyText.planTitle)}</EditableCopy><EditableCopy config={config} id="category.planText">{textValue(config, "category.planText", familyText.planBody)}</EditableCopy></div><ol>{copy.planning.map((step, index) => <li key={step}><span>Reel {String(index + 1).padStart(2, "0")}</span><EditableCopy config={config} id={`category.planStep.${index}`}>{textValue(config, `category.planStep.${index}`, step)}</EditableCopy><Film size={18} aria-hidden="true" /></li>)}</ol></section>
}

function ServicePlan({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) { const { config, copy } = context; return <section className={`${styles.servicePlan} ${styles.servicesJourney}`} data-family="services"><div><p>{copy.label}</p><EditableCopy config={config} id="category.planHeadline" as="h2">{textValue(config, "category.planHeadline", familyText.planTitle)}</EditableCopy><EditableCopy config={config} id="category.planText">{textValue(config, "category.planText", familyText.planBody)}</EditableCopy></div><div className={styles.servicePlanSteps}>{copy.planning.map((step, index) => <div key={step}><b>0{index + 1}</b><EditableCopy config={config} id={`category.planStep.${index}`}>{textValue(config, `category.planStep.${index}`, step)}</EditableCopy><ArrowRight size={16} aria-hidden="true" /></div>)}</div></section> }

function CategoryBenefits({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { partner, config, family, contactHref, showMockDeals } = context
  const deals = getMicrositePublicDeals(partner.deals)
  const rewards = getMicrositeStampRewards(partner.reward_milestones)
  const mockDeals = !deals.length && showMockDeals
    ? mockDealsFor(context)
    : []
  if (!deals.length && !rewards.length && !mockDeals.length) return null
  const twoForOneDeal = deals.find(isMicrositeTwoForOneDeal)
  const standardDeals = twoForOneDeal
    ? deals.filter((deal) => deal !== twoForOneDeal)
    : deals
  const { featuredDeal, secondaryDeals } = partitionMicrositePublicDeals(standardDeals)
  const displayedCount = standardDeals.length || mockDeals.length
  const onlyOneBenefit = !twoForOneDeal && displayedCount === 1 && rewards.length === 0
  const secondaryMockDeals = mockDeals.slice(1)
  const hasStandardBenefit = Boolean(featuredDeal || mockDeals[0] || secondaryDeals.length || secondaryMockDeals.length)
  return <section id="deals" className={`${styles.benefits} ${onlyOneBenefit ? styles.benefitsSingle : ""}`} data-family={family} data-preview={mockDeals.length ? "true" : undefined}>
    {twoForOneDeal ? <TwoForOneHighlight deal={twoForOneDeal} config={config} family={family} contactHref={contactHref} /> : null}
    <div className={`${styles.benefitsIntro} ${!hasStandardBenefit && !rewards.length ? styles.benefitsIntroStandalone : ""}`}>
      {mockDeals.length ? <span className={styles.previewNote}>{config.language === "en" ? "Builder preview · not published" : "Builder-Vorschau · wird nicht veröffentlicht"}</span> : null}
      <EditableCopy config={config} id="deals.label">{config.deals.label || "Benefitsi"}</EditableCopy>
      <EditableCopy config={config} id="deals.headline" as="h2">{config.deals.headline || familyText.benefitsTitle}</EditableCopy>
      <EditableCopy config={config} id="deals.description">{config.deals.description || familyText.benefitsBody}</EditableCopy>
    </div>
    {featuredDeal ? <DealCard deal={featuredDeal} config={config} family={family} contactHref={contactHref} featured /> : null}
    {mockDeals[0] ? <MockDealCard deal={mockDeals[0]} family={family} contactHref={contactHref} featured /> : null}
    {(secondaryDeals.length || secondaryMockDeals.length) ? <div className={`${styles.benefitRail} ${secondaryDeals.length + secondaryMockDeals.length === 1 ? styles.benefitRailSingle : ""}`}>
      {secondaryDeals.map((deal) => <DealCard key={deal.id || micrositeDealTitle(deal, config.language)} deal={deal} config={config} family={family} contactHref={contactHref} />)}
      {secondaryMockDeals.map((deal) => <MockDealCard key={deal.id} deal={deal} family={family} contactHref={contactHref} />)}
    </div> : null}
    {rewards.length ? <StampRewardsPanel rewards={rewards} language={config.language} /> : null}
  </section>
}

function TwoForOneHighlight({ deal, config, family, contactHref }: { deal: Deal; config: MicrositeConfig; family: CategoryFamily; contactHref: string }) {
  const title = micrositeDealTitle(deal, config.language)
  const description = micrositeDealDescription(deal, config.language)
  const details = micrositeDealDetails(deal, config.language).slice(0, 2)
  const english = config.language === "en"

  return <article className={styles.twoForOneHighlight} data-family={family}>
    <div className={styles.twoForOneMark} aria-label={english ? "Two for one" : "Zwei für eins"}><strong>2</strong><span>{english ? "for" : "für"}</span><strong>1</strong></div>
    <div className={styles.twoForOneCopy}>
      <p>{english ? "2 FOR 1 · Benefitsi deal" : "2 FÜR 1 · Benefitsi Vorteil"}</p>
      <h3>{title}</h3>
      <span>{description}</span>
      {details.length ? <ul>{details.map((detail) => <li key={detail}><Check size={14} aria-hidden="true" />{detail}</li>)}</ul> : null}
    </div>
    <a className={styles.twoForOneCta} href={contactHref}><span {...editable("deals.topDealButtonLabel", "text", "Vorteil Button")} style={textStyleFor(config, "deals.topDealButtonLabel")}>{config.deals.topDealButtonLabel}</span><ArrowRight size={16} aria-hidden="true" /></a>
  </article>
}

function rewardTitle(reward: ReturnType<typeof getMicrositeStampRewards>[number], language: MicrositeConfig["language"]) {
  return reward.title || reward.reward_item || reward.customer_description || (language === "en" ? "Partner reward" : "Partner-Belohnung")
}

function StampRewardsPanel({ rewards, language }: { rewards: ReturnType<typeof getMicrositeStampRewards>; language: MicrositeConfig["language"] }) {
  const english = language === "en"
  return <aside className={styles.stampRewards} aria-label={english ? "Stamp rewards" : "Stempel-Belohnungen"}>
    <div className={styles.stampRewardsIntro}><Gift size={24} strokeWidth={1.5} aria-hidden="true" /><div><p>{english ? "Collect stamps in the Benefitsi app" : "Stempel in der Benefitsi App sammeln"}</p><span>{english ? "Reach a stamp level to unlock this partner’s reward." : "Erreiche eine Stempelstufe und schalte die Belohnung dieses Partners frei."}</span></div></div>
    <ol>{rewards.slice(0, 3).map((reward) => <li key={reward.id || `${reward.required_stamps}-${reward.title}`}><strong><small>{english ? "at" : "ab"}</small>{reward.required_stamps}<em>{english ? "stamps" : "Stempel"}</em></strong><div><span>{english ? "Partner reward" : "Partner-Belohnung"}</span><b>{rewardTitle(reward, language)}</b></div></li>)}</ol>
  </aside>
}

type MockDeal = {
  id: string
  label: string
  title: string
  description: string
  details: string[]
}

function mockDealsFor(context: MicrositeContext): MockDeal[] {
  const { config, family, copy, name } = context
  const en = config.language === "en"
  const byFamily: Record<CategoryFamily, Array<Omit<MockDeal, "id">>> = {
    wellness: [
      { label: en ? "Preview benefit" : "Vorschau-Vorteil", title: en ? `10% off your first ${copy.label.toLowerCase()}` : `10 % auf deine erste ${copy.label.slice(0, -1) || "Behandlung"}`, description: en ? `A calm first visit at ${name}. This is demo content for the builder.` : `Eine ruhige erste Auszeit bei ${name}. Dieser Inhalt ist nur als Demo im Builder sichtbar.`, details: en ? ["Choose a treatment", "Confirm duration with the studio"] : ["Behandlung auswählen", "Dauer direkt mit dem Studio klären"] },
      { label: en ? "Preview benefit" : "Vorschau-Vorteil", title: en ? "A little extra time for you" : "Ein bisschen mehr Zeit für dich", description: en ? "A second demo benefit shows how the collection will feel once offers are live." : "Ein zweiter Demo-Vorteil zeigt, wie die Sammlung mit echten Aktionen wirkt.", details: en ? ["Visible only in preview", "Never published"] : ["Nur in der Vorschau sichtbar", "Wird nie veröffentlicht"] },
    ],
    activities: [
      { label: en ? "Preview benefit" : "Vorschau-Vorteil", title: en ? `A better day out at ${name}` : `Mehr aus deinem Besuch bei ${name}`, description: en ? "A demo card for planning the next experience with Benefitsi." : "Eine Demo-Karte für die Planung deines nächsten Erlebnisses mit Benefitsi.", details: en ? ["Plan your visit", "Activate in the app"] : ["Besuch planen", "In der App aktivieren"] },
      { label: en ? "Preview benefit" : "Vorschau-Vorteil", title: en ? "Bring someone along" : "Zusammen macht es mehr Spaß", description: en ? "A second preview card for group visits, tickets or shared experiences." : "Eine zweite Vorschaukarte für Gruppen, Tickets oder gemeinsame Erlebnisse.", details: en ? ["Demo content only", "Not publicly visible"] : ["Nur Demo-Inhalt", "Nicht öffentlich sichtbar"] },
    ],
    services: [
      { label: en ? "Preview benefit" : "Vorschau-Vorteil", title: en ? `An extra for your next ${copy.label.toLowerCase()}` : `Ein Extra für deine nächste ${copy.label.slice(0, -1) || "Leistung"}`, description: en ? "A realistic preview for benefits that can be set up by the partner later." : "Eine realistische Vorschau für Vorteile, die der Partner später anlegen kann.", details: en ? ["Ask the team directly", "Activate in the app"] : ["Direkt beim Team anfragen", "In der App aktivieren"] },
      { label: en ? "Preview benefit" : "Vorschau-Vorteil", title: en ? "A practical partner extra" : "Ein praktischer Partner-Vorteil", description: en ? "This demo helps evaluate the layout before a real offer exists." : "Diese Demo hilft, das Layout zu beurteilen, bevor ein echter Vorteil angelegt ist.", details: en ? ["Preview only", "Not published"] : ["Nur Vorschau", "Wird nicht veröffentlicht"] },
    ],
  }

  return byFamily[family].map((deal, index) => ({ ...deal, id: `preview-${family}-${index}` }))
}

function DealCard({ deal, config, family, contactHref, featured = false }: { deal: Deal; config: MicrositeConfig; family: CategoryFamily; contactHref: string; featured?: boolean }) {
  const title = micrositeDealTitle(deal, config.language)
  const description = micrositeDealDescription(deal, config.language)
  const details = micrositeDealDetails(deal, config.language).slice(0, 2)
  return <article className={featured ? styles.featuredBenefit : styles.benefitCard} data-family={family}><p>{micrositeDealTypeLabel(deal, config.language)}</p><h3>{title}</h3><span>{description}</span>{details.length ? <ul>{details.map((detail) => <li key={detail}><Check size={14} aria-hidden="true" />{detail}</li>)}</ul> : null}<a href={contactHref}><span {...editable("deals.topDealButtonLabel", "text", "Vorteil Button")} style={textStyleFor(config, "deals.topDealButtonLabel")}>{config.deals.topDealButtonLabel}</span><ArrowRight size={15} aria-hidden="true" /></a></article>
}

function MockDealCard({ deal, family, contactHref, featured = false }: { deal: MockDeal; family: CategoryFamily; contactHref: string; featured?: boolean }) {
  return <article className={featured ? styles.featuredBenefit : styles.benefitCard} data-family={family} data-preview-card="true"><p>{deal.label}</p><h3>{deal.title}</h3><span>{deal.description}</span><ul>{deal.details.map((detail) => <li key={detail}><Check size={14} aria-hidden="true" />{detail}</li>)}</ul><a href={contactHref} onClick={(event) => event.preventDefault()}>{"Preview"}<ArrowRight size={15} aria-hidden="true" /></a></article>
}

function CategoryStory({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) { const { config, family, name, storyImage } = context; return <section id="ueber-uns" className={styles.story} data-family={family}>{storyImage ? <img {...editable("content.aboutHeroImageUrl", "image", "Über-uns Bild")} src={storyImage} alt={name} loading="lazy" style={imageStyleFor(config, "content.aboutHeroImageUrl")} /> : <div className={styles.storyFallback} aria-hidden="true" />}<div><EditableCopy config={config} id="content.aboutLabel">{textValue(config, "content.aboutLabel", familyText.storyTitle)}</EditableCopy><EditableCopy config={config} id="content.aboutHeadline" as="h2">{config.content.aboutHeadline}</EditableCopy><EditableCopy config={config} id="content.aboutText">{config.content.aboutText}</EditableCopy><a href="#kontakt" className={styles.storyLink}>{config.language === "en" ? "Meet the team" : "Team kennenlernen"}<ArrowRight size={16} aria-hidden="true" /></a></div></section> }

function CategoryAppPrompt({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) {
  const { config, family, appUrl, partner } = context
  const nextReward = getMicrositeStampRewards(partner.reward_milestones)[0]
  const english = config.language === "en"
  const stampMessage = nextReward
    ? english
      ? `Collect stamps in the Benefitsi app. At ${nextReward.required_stamps} stamps, unlock: ${rewardTitle(nextReward, config.language)}.`
      : `Sammle Stempel in der Benefitsi App. Ab ${nextReward.required_stamps} Stempeln schaltest du frei: ${rewardTitle(nextReward, config.language)}.`
    : english
      ? "Collect stamps in the Benefitsi app. Partner rewards unlock once you reach their stamp level."
      : "Sammle Stempel in der Benefitsi App. Partner-Belohnungen schaltest du ab der jeweiligen Stempelstufe frei."

  return <section id="app" className={styles.appPrompt} data-family={family}><div><p>Benefitsi App</p><EditableCopy config={config} id="content.appHeadline" as="h2">{config.content.appHeadline || familyText.appTitle}</EditableCopy><EditableCopy config={config} id="content.appText">{config.content.appText || familyText.appBody}</EditableCopy><p className={styles.appStampMessage}><Gift size={18} strokeWidth={1.5} aria-hidden="true" /><span>{stampMessage}</span></p><a href={appUrl}>{english ? "Open the app" : "App öffnen"}<ArrowRight size={16} aria-hidden="true" /></a></div><div className={styles.appToken}><img src="/Benefitsi_Icon_FullColor_RGB_512.png" alt="Benefitsi" width={42} height={42} /><span>{english ? "Your benefits, ready when you are." : "Deine Vorteile, wenn du sie brauchst."}</span><Gift size={44} strokeWidth={1} aria-hidden="true" /></div></section>
}

function CategoryContact({ context, familyText }: { context: MicrositeContext; familyText: Record<string, string> }) { const { partner, config, family, address, phone, website, mapUrl } = context; return <section id="kontakt" className={styles.contact} data-family={family}><div><EditableCopy config={config} id="content.contactLabel">{config.content.contactLabel || familyText.contactTitle}</EditableCopy><EditableCopy config={config} id="content.contactHeadline" as="h2">{config.content.contactHeadline}</EditableCopy><div className={styles.contactLinks}>{address ? <span><MapPin size={17} aria-hidden="true" />{address}</span> : null}{phone ? <a href={`tel:${phone}`}><Phone size={17} aria-hidden="true" />{partner.phone}</a> : null}{partner.email ? <a href={`mailto:${partner.email}`}>{partner.email}</a> : null}{website ? <a href={website}>{config.language === "en" ? "Visit website" : "Website besuchen"}<ArrowRight size={15} aria-hidden="true" /></a> : null}{mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer"><Route size={17} aria-hidden="true" />{config.language === "en" ? "Get directions" : "Route planen"}</a> : null}</div></div><div className={styles.hours}><h3><Clock3 size={19} aria-hidden="true" />{config.language === "en" ? "Opening hours" : "Öffnungszeiten"}</h3><OpeningHours partner={partner} language={config.language} /></div></section> }

function CategoryFaq({ context }: { context: MicrositeContext }) { const { partner, config, family } = context; return <section id="faq" className={styles.faq} data-family={family}><EditableCopy config={config} id="category.faqHeadline" as="h2">{textValue(config, "category.faqHeadline", config.language === "en" ? "Before you visit" : "Vor deinem Besuch")}</EditableCopy><div>{micrositeFaqItemsForPartner(partner, config).slice(0, 4).map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></section> }

function CategoryFooter({ context }: { context: MicrositeContext }) { const { config, family, name, copy } = context; return <footer className={styles.footer} data-family={family}><div><strong>{name}</strong><p>{normalizeCategoryText(config.content.footerText)}</p></div><nav aria-label={config.language === "en" ? "Footer navigation" : "Footer-Navigation"}><a href="#speisekarte">{copy.label}</a><a href="#kontakt">{config.language === "en" ? "Contact" : "Kontakt"}</a><a href="https://benefitsi.de/impressum">{config.language === "en" ? "Legal notice" : "Impressum"}</a><a href="https://benefitsi.de/datenschutz">{config.language === "en" ? "Privacy" : "Datenschutz"}</a></nav><span>Powered by Benefitsi</span></footer> }

function OpeningHours({ partner, language }: { partner: PartnerWithDeals; language: MicrositeConfig["language"] }) {
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

function formatOfferingPrice(value: number | string | null, currency: string | null, language: MicrositeConfig["language"]) {
  if (value == null || value === "") return language === "en" ? "On request" : "Auf Anfrage"
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  try { return new Intl.NumberFormat(language === "en" ? "en-GB" : "de-DE", { style: "currency", currency: currency || "EUR" }).format(numeric) } catch { return String(value) }
}

function normalizeCategoryText(value: string | null | undefined) { return value?.replace(/[–—]/g, "-") || "" }

function EditableCopy({ config, id, children, as: Tag = "p", className }: { config: MicrositeConfig; id: string; children: string; as?: "p" | "h1" | "h2"; className?: string }) { return <Tag {...editable(id, "text", id)} className={className} style={textStyleFor(config, id)}>{normalizeCategoryText(textValue(config, id, children))}</Tag> }

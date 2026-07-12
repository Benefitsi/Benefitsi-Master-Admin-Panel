/* eslint-disable @next/next/no-img-element */
"use client"

import { useMemo, useState, type CSSProperties, type ReactElement } from "react"
import type { PartnerWithDeals } from "@/lib/admin-data"
import type { MicrositeConfig, MicrositeElementStyle } from "@/lib/microsites"
import {
  defaultMicrositeFaqItems,
} from "@/lib/microsite-seo"
import {
  hasAnyPartnerSocials,
  partnerSocialLabel,
  partnerSocialUrl,
  preferredContactUrl,
} from "@/lib/microsite-personalization"

type SignatureProfile = "salon" | "wellness" | "cinema"

type SignatureCard = {
  id: string
  title: string
  text: string
  icon: string
}

const socialPlatforms = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "website", label: "Website" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
] as const

const BENEFITSI_ICON_SRC = "/Benefitsi_Icon_FullColor_RGB_512.png"
const BENEFITSI_QR_PLACEHOLDER_SRC = "/benefitsi-app-qr-placeholder.png"
const PARTNER_DETAIL_SCREEN_SRC = "/partner-details-page.jpg"

export function PartnerSignatureMicrosite({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const profile = signatureProfileForTemplate(config.template)
  const theme = themeForTemplate(config.template)
  const heroImage = config.hero.backgroundImageUrl || partner.feature_card_url || "/upload-image.jpg"
  const cards = useMemo(() => signatureCardsForPartner(partner, config, profile), [partner, config, profile])
  const callToActionHref =
    preferredContactUrl(partner) ||
    (partner.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partner.address)}` : "#kontakt")

  return (
    <article
      className={`@container relative min-w-0 max-w-full overflow-hidden rounded-[1.2rem] @min-[640px]:rounded-[1.8rem] ${theme.shell}`}
      style={
        {
          "--site-accent": config.branding.accent,
          "--site-secondary": config.branding.accentSecondary,
        } as CSSProperties
      }
    >
      <SignatureHeader partner={partner} config={config} theme={theme} />

      <section className={`relative overflow-hidden px-4 pb-10 pt-6 @min-[640px]:px-7 @min-[1024px]:px-10 @min-[1024px]:pb-14 @min-[1024px]:pt-8 ${theme.heroSection}`}>
        <div className="absolute inset-0">
          <img
            {...editable("hero.backgroundImageUrl", "image", "Startbild")}
            src={heroImage}
            alt=""
            className={`h-full w-full object-cover ${theme.heroImageClass}`}
            style={imageStyleFor(config, "hero.backgroundImageUrl")}
          />
          <div className={`absolute inset-0 ${theme.heroOverlay}`} />
        </div>

        <div className="relative z-10 mx-auto grid min-w-0 max-w-6xl gap-8 @min-[1024px]:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)] @min-[1024px]:items-end">
          <div className="min-w-0">
            <p
              {...editable("hero.badgeText", "text", "Badge-Text")}
              className={`inline-flex min-w-0 max-w-full whitespace-normal rounded-full px-4 py-2 text-left text-[11px] font-black uppercase leading-4 tracking-[0.08em] shadow-sm @min-[640px]:tracking-[0.14em] ${theme.eyebrow}`}
              style={textStyleFor(config, "hero.badgeText")}
            >
              {config.hero.badgeText}
            </p>
            <h1
              {...editable("hero.headline", "text", "Startbereich Überschrift")}
              className={`mt-5 max-w-[14ch] text-[clamp(2.15rem,12vw,5.4rem)] font-black leading-[0.98] tracking-normal break-words ${theme.heroTitle}`}
              style={textStyleFor(config, "hero.headline")}
            >
              {config.hero.headline}
            </h1>
            <p
              {...editable("hero.slogan", "text", "Startbereich Slogan")}
              className={`mt-4 max-w-2xl text-[clamp(1.05rem,2.3vw,1.5rem)] leading-relaxed break-words ${theme.heroSlogan}`}
              style={textStyleFor(config, "hero.slogan")}
            >
              {config.hero.slogan}
            </p>

            <div className="mt-6 flex min-w-0 flex-wrap gap-3">
              <HeroAction
                id="hero.primaryButtonLabel"
                href={callToActionHref}
                label={config.hero.primaryButtonLabel}
                primary
                config={config}
                theme={theme}
              />
              <HeroAction
                id="hero.secondaryButtonLabel"
                href="#speisekarte"
                label={config.hero.secondaryButtonLabel}
                config={config}
                theme={theme}
              />
            </div>

            <div className="mt-7 grid min-w-0 gap-3 @min-[640px]:grid-cols-3">
              <SignatureMeta
                id="hero.locationText"
                label="Ort"
                value={config.hero.locationText}
                icon="pin"
                config={config}
                theme={theme}
              />
              <SignatureMeta
                id="hero.openingText"
                label="Geöffnet"
                value={config.hero.openingText}
                icon="clock"
                config={config}
                theme={theme}
              />
              <SignatureMeta
                id="content.contact.phone"
                label="Kontakt"
                value={partner.phone || partner.website || partner.email || "Details folgen"}
                icon="phone"
                config={config}
                theme={theme}
              />
            </div>
          </div>

          <div className={`min-w-0 max-w-full rounded-[1.25rem] p-4 shadow-2xl backdrop-blur-xl @min-[640px]:rounded-[1.6rem] ${theme.heroCard}`}>
            <div className="grid min-w-0 gap-3 @min-[640px]:grid-cols-2">
              {cards.slice(0, 4).map((card, index) => (
                <HighlightCard
                  key={card.id}
                  config={config}
                  theme={theme}
                  index={index}
                  card={card}
                />
              ))}
            </div>
            <div className={`mt-4 rounded-[1.2rem] p-4 ${theme.callout}`}>
              <p
                {...editable("deals.headline", "text", "Deals Überschrift")}
                className="text-lg font-black tracking-normal break-words"
                style={textStyleFor(config, "deals.headline")}
              >
                {config.deals.headline}
              </p>
              <p
                {...editable("deals.description", "text", "Deals Beschreibung")}
                className="mt-2 text-sm leading-6 break-words opacity-85"
                style={textStyleFor(config, "deals.description")}
              >
                {config.deals.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="deals" className="scroll-mt-24 px-4 py-8 @min-[640px]:px-7 @min-[1024px]:px-10">
        <div className="mx-auto grid min-w-0 max-w-6xl gap-5 @min-[1024px]:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div className={`min-w-0 rounded-[1.25rem] p-4 @min-[640px]:rounded-[1.6rem] @min-[640px]:p-5 ${theme.panel}`}>
            <p
              {...editable("deals.label", "text", "Deals-Label")}
              className={`text-xs font-black uppercase leading-5 tracking-[0.08em] @min-[640px]:tracking-[0.14em] ${theme.sectionEyebrow}`}
              style={textStyleFor(config, "deals.label")}
            >
              {config.deals.label}
            </p>
            <h2
              {...editable("deals.topDealHeadline", "text", "Top-Deal Überschrift")}
              className="mt-3 text-[clamp(1.7rem,9vw,3rem)] font-black leading-[1.04] tracking-normal break-words"
              style={textStyleFor(config, "deals.topDealHeadline")}
            >
              {config.deals.topDealHeadline}
            </h2>
            <p
              {...editable("deals.topDealDescription", "text", "Top-Deal Beschreibung")}
              className="mt-4 text-sm leading-7 break-words opacity-80"
              style={textStyleFor(config, "deals.topDealDescription")}
            >
              {config.deals.topDealDescription}
            </p>
            <div className="mt-5 grid gap-2">
              {config.deals.topDealBullets.slice(0, 3).map((item, index) => (
                <div key={`${item}-${index}`} className={`flex items-start gap-3 rounded-2xl p-3 ${theme.softCard}`}>
                  <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${theme.bulletIcon}`}>
                    <Glyph name="check" className="size-4" />
                  </span>
                  <span
                    {...editable(`deals.topDealBullets.${index}`, "text", `Top-Deal Punkt ${index + 1}`)}
                    className="min-w-0 text-sm font-semibold leading-6 break-words"
                    style={textStyleFor(config, `deals.topDealBullets.${index}`)}
                  >
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={`min-w-0 overflow-hidden rounded-[1.25rem] @min-[640px]:rounded-[1.6rem] ${theme.mediaPanel}`}>
            <img
              {...editable("deals.topDealImageUrl", "image", "Top-Deal Bild")}
              src={config.deals.topDealImageUrl || heroImage}
              alt=""
              className="h-full min-h-[280px] w-full object-cover"
              style={imageStyleFor(config, "deals.topDealImageUrl")}
            />
          </div>
        </div>
      </section>

      <section id="speisekarte" className="scroll-mt-24 px-4 py-8 @min-[640px]:px-7 @min-[1024px]:px-10">
        <div className="mx-auto min-w-0 max-w-6xl">
          <div className="flex flex-col gap-4 @min-[1024px]:flex-row @min-[1024px]:items-end @min-[1024px]:justify-between">
            <div className="min-w-0">
              <p
                {...editable("content.menuLabel", "text", "Speisekarte Label")}
                className={`text-xs font-black uppercase leading-5 tracking-[0.08em] @min-[640px]:tracking-[0.14em] ${theme.sectionEyebrow}`}
                style={textStyleFor(config, "content.menuLabel")}
              >
                {config.content.menuLabel}
              </p>
              <h2
                {...editable("content.menuHeadline", "text", "Speisekarte Überschrift")}
                className="mt-3 text-[clamp(1.7rem,9vw,3rem)] font-black leading-[1.04] tracking-normal break-words"
                style={textStyleFor(config, "content.menuHeadline")}
              >
                {config.content.menuHeadline}
              </h2>
            </div>
            <p
              {...editable("content.menuDescription", "text", "Speisekarte Beschreibung")}
              className="max-w-2xl text-sm leading-7 break-words opacity-80"
              style={textStyleFor(config, "content.menuDescription")}
            >
              {config.content.menuDescription}
            </p>
          </div>

          <div className="mt-6 grid min-w-0 gap-4 @min-[768px]:grid-cols-2 @min-[1280px]:grid-cols-3">
            {cards.map((card, index) => (
              <FeatureCard
                key={`${card.id}-${index}`}
                card={card}
                config={config}
                index={index}
                theme={theme}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="ueber-uns" className="scroll-mt-24 px-4 py-8 @min-[640px]:px-7 @min-[1024px]:px-10">
        <div className={`mx-auto grid min-w-0 max-w-6xl gap-5 rounded-[1.25rem] p-4 @min-[640px]:rounded-[1.8rem] @min-[640px]:p-5 @min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(260px,.78fr)] @min-[1024px]:p-8 ${theme.panel}`}>
          <div className="min-w-0">
            <p
              {...editable("content.aboutLabel", "text", "Über uns Label")}
              className={`text-xs font-black uppercase leading-5 tracking-[0.08em] @min-[640px]:tracking-[0.14em] ${theme.sectionEyebrow}`}
              style={textStyleFor(config, "content.aboutLabel")}
            >
              {config.content.aboutLabel}
            </p>
            <h2
              {...editable("content.aboutHeadline", "text", "Über uns Überschrift")}
              className="mt-3 text-[clamp(1.7rem,9vw,3rem)] font-black leading-[1.04] tracking-normal break-words"
              style={textStyleFor(config, "content.aboutHeadline")}
            >
              {config.content.aboutHeadline}
            </h2>
            <p
              {...editable("content.aboutText", "text", "Über uns Text")}
              className="mt-4 text-sm leading-7 break-words opacity-85"
              style={textStyleFor(config, "content.aboutText")}
            >
              {config.content.aboutText}
            </p>
            <div className="mt-5 grid gap-3 @min-[640px]:grid-cols-2">
              {config.hero.services.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className={`flex min-w-0 items-start gap-3 rounded-2xl p-3 ${theme.softCard}`}
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${theme.badge}`}>
                    <Glyph name={item.icon} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p
                      {...editable(`hero.services.${index}.label`, "text", `Service ${index + 1}`)}
                      className="text-sm font-bold break-words"
                      style={textStyleFor(config, `hero.services.${index}.label`)}
                    >
                      {item.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-3">
            <div className={`min-w-0 overflow-hidden rounded-[1.4rem] ${theme.mediaPanel}`}>
              <img
                {...editable("content.aboutHeroImageUrl", "image", "Über uns Hintergrundbild")}
                src={textValue(config, "content.aboutHeroImageUrl", heroImage)}
                alt=""
                className="h-56 w-full object-cover"
                style={imageStyleFor(config, "content.aboutHeroImageUrl")}
              />
            </div>
            <div className="grid gap-3 @min-[640px]:grid-cols-2">
              <div className={`min-w-0 overflow-hidden rounded-[1.25rem] ${theme.mediaPanel}`}>
                <img
                  {...editable("content.aboutIngredientImageUrl", "image", "Über uns Zutatenbild")}
                  src={textValue(config, "content.aboutIngredientImageUrl", config.deals.illustrationUrl || heroImage)}
                  alt=""
                  className="h-40 w-full object-cover"
                  style={imageStyleFor(config, "content.aboutIngredientImageUrl")}
                />
              </div>
              <div className={`min-w-0 overflow-hidden rounded-[1.25rem] ${theme.mediaPanel}`}>
                <img
                  {...editable("content.aboutLocationImageUrl", "image", "Über uns Ortsbild")}
                  src={textValue(config, "content.aboutLocationImageUrl", config.deals.topDealImageUrl || heroImage)}
                  alt=""
                  className="h-40 w-full object-cover"
                  style={imageStyleFor(config, "content.aboutLocationImageUrl")}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <SignatureAppSection partner={partner} config={config} theme={theme} />

      <section id="kontakt" className="scroll-mt-24 px-4 py-8 @min-[640px]:px-7 @min-[1024px]:px-10">
        <div className="mx-auto grid min-w-0 max-w-6xl gap-5 @min-[1024px]:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div className={`min-w-0 rounded-[1.25rem] p-4 @min-[640px]:rounded-[1.8rem] @min-[640px]:p-5 @min-[1024px]:p-7 ${theme.panel}`}>
            <p
              {...editable("content.contactLabel", "text", "Kontakt Label")}
              className={`text-xs font-black uppercase leading-5 tracking-[0.08em] @min-[640px]:tracking-[0.14em] ${theme.sectionEyebrow}`}
              style={textStyleFor(config, "content.contactLabel")}
            >
              {config.content.contactLabel}
            </p>
            <h2
              {...editable("content.contactHeadline", "text", "Kontakt Überschrift")}
              className="mt-3 text-[clamp(1.7rem,9vw,3rem)] font-black leading-[1.04] tracking-normal break-words"
              style={textStyleFor(config, "content.contactHeadline")}
            >
              {config.content.contactHeadline}
            </h2>
            <div className="mt-5 space-y-3">
              <ContactRow
                id="content.contact.address"
                label="Adresse"
                value={partner.address || config.hero.locationText || "Adresse folgt"}
                config={config}
                theme={theme}
              />
              <ContactRow
                id="content.contact.phone"
                label="Telefon"
                value={partner.phone || partner.email || partner.website || "Kontaktdaten folgen"}
                config={config}
                theme={theme}
              />
              <ContactRow
                id="content.contact.opening"
                value={config.hero.openingText}
                config={config}
                theme={theme}
                label="Öffnungszeiten"
              />
            </div>
          </div>

          <div className={`min-w-0 rounded-[1.25rem] p-4 @min-[640px]:rounded-[1.8rem] @min-[640px]:p-5 @min-[1024px]:p-7 ${theme.panel}`}>
            <p
              {...editable("content.contactSocialText", "text", "Social-Media-Text")}
              className="text-sm font-semibold leading-6 break-words"
              style={textStyleFor(config, "content.contactSocialText")}
            >
              {textValue(config, "content.contactSocialText", "Bleib für Aktionen, Angebote und lokale Highlights verbunden.")}
            </p>

            <div className="mt-5 flex min-w-0 flex-wrap gap-3">
              {socialPlatforms
                .filter((platform) => socialVisible(config, partner, platform.id))
                .map((platform) => (
                  <SocialPill
                    key={platform.id}
                    platform={platform.id}
                    label={platform.label}
                    partner={partner}
                    config={config}
                    theme={theme}
                  />
                ))}
            </div>

            <div className={`mt-6 min-w-0 overflow-hidden rounded-[1.4rem] ${theme.mediaPanel}`}>
              <img
                {...editable("content.aboutPrepImageUrl", "image", "Über uns Detailbild")}
                src={textValue(config, "content.aboutPrepImageUrl", config.deals.topDealImageUrl || heroImage)}
                alt=""
                className="h-56 w-full object-cover"
                style={imageStyleFor(config, "content.aboutPrepImageUrl")}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 px-4 py-8 @min-[640px]:px-7 @min-[1024px]:px-10">
        <div className={`mx-auto min-w-0 max-w-6xl rounded-[1.25rem] p-4 @min-[640px]:rounded-[1.8rem] @min-[640px]:p-5 @min-[1024px]:p-7 ${theme.panel}`}>
          <p
            {...editable("content.faqLabel", "text", "FAQ-Label")}
            className={`text-xs font-black uppercase leading-5 tracking-[0.08em] @min-[640px]:tracking-[0.14em] ${theme.sectionEyebrow}`}
            style={textStyleFor(config, "content.faqLabel")}
          >
            {textValue(config, "content.faqLabel", "FAQ")}
          </p>
          <h2
            {...editable("content.faqHeadline", "text", "FAQ Überschrift")}
            className="mt-3 text-[clamp(1.7rem,9vw,3rem)] font-black leading-[1.04] tracking-normal break-words"
            style={textStyleFor(config, "content.faqHeadline")}
          >
            {textValue(config, "content.faqHeadline", "Hilfreiche Antworten vor dem Besuch.")}
          </h2>
          <p
            {...editable("content.faqText", "text", "FAQ Text")}
            className="mt-4 max-w-2xl text-sm leading-7 break-words opacity-80"
            style={textStyleFor(config, "content.faqText")}
          >
            {textValue(config, "content.faqText", "Use this section to answer the questions guests ask most often before booking or visiting.")}
          </p>

          <div className="mt-6 grid gap-3">
            {defaultMicrositeFaqItems.slice(0, 4).map((item, index) => (
              <FaqRow
                key={item.question}
                index={index}
                item={item}
                config={config}
                theme={theme}
              />
            ))}
          </div>
        </div>
      </section>

      <footer className="px-4 pb-8 pt-4 @min-[640px]:px-7 @min-[1024px]:px-10">
        <div className={`mx-auto flex min-w-0 max-w-6xl flex-col gap-4 rounded-[1.25rem] px-4 py-5 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-between @min-[640px]:rounded-[1.5rem] @min-[640px]:px-5 ${theme.footer}`}>
          <div className="min-w-0">
            <p className="text-sm font-black tracking-normal break-words">
              {partner.name || config.hero.headline}
            </p>
            <p
              {...editable("content.footerText", "text", "Footer-Text")}
              className="mt-1 text-sm leading-6 break-words opacity-80"
              style={textStyleFor(config, "content.footerText")}
            >
              {config.content.footerText}
            </p>
          </div>
          <a
            href={callToActionHref}
            className={`inline-flex w-full min-w-0 items-center justify-center rounded-full px-5 py-3 text-center text-sm font-black transition @min-[640px]:w-auto ${theme.ctaButton}`}
          >
            Partner besuchen
          </a>
        </div>
      </footer>
    </article>
  )
}

function SignatureHeader({
  partner,
  config,
  theme,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      {...editable("navigation.group", "group", "Top-Navigation")}
      className={`sticky top-0 z-30 backdrop-blur-xl ${theme.header}`}
      style={{
        minHeight: config.elementStyles["navigation.group"]?.height
          ? `${config.elementStyles["navigation.group"]?.height}px`
          : undefined,
        ...spacingStyleFor(config, "navigation.group"),
      }}
    >
      <div className="mx-auto flex min-w-0 max-w-6xl items-center justify-between gap-3 px-4 py-3 @min-[640px]:gap-4 @min-[640px]:px-7 @min-[1024px]:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <span
            {...editable("branding.logo", "group", "Logo (Partnerprofil)")}
            className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/5"
          >
            <img
              src={config.branding.logoUrl || partner.logo_url || "/Benefitsi_Icon_FullColor_RGB_512.png"}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          </span>
          <div className="min-w-0">
            <p
              {...editable("branding.partnerName", "text", "Partnername")}
              className="truncate text-sm font-black tracking-normal"
              style={textStyleFor(config, "branding.partnerName")}
            >
              {textValue(config, "branding.partnerName", partner.name || config.hero.headline)}
            </p>
            <p className="truncate text-xs opacity-70">{config.hero.locationText}</p>
          </div>
        </div>

        <nav
          className="hidden min-w-0 items-center gap-2 @min-[1024px]:flex"
          style={navigationGroupStyleFor(config)}
        >
          {config.navigation.links.map((link) => (
            <a
              key={link.anchor}
              {...editable(`navigation.${link.anchor}`, "text", `Navigation ${link.label}`)}
              href={`#${link.anchor}`}
              className={`rounded-full px-3 py-2 text-xs font-bold transition ${theme.navLink}`}
              style={textStyleFor(config, `navigation.${link.anchor}`)}
            >
              {textValue(config, `navigation.${link.anchor}`, link.label)}
            </a>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className={`grid size-10 place-items-center rounded-full shadow-sm @min-[1024px]:hidden ${theme.mobileMenu}`}
        >
          <Glyph name="menu" className="size-5" />
        </button>
      </div>

      {menuOpen ? (
        <div className={`px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.08)] @min-[640px]:px-5 @min-[1024px]:hidden ${theme.mobilePanel}`}>
          <div className="grid gap-2">
            {config.navigation.links.map((link) => (
              <a
                key={link.anchor}
                href={`#${link.anchor}`}
                onClick={() => setMenuOpen(false)}
                className={`rounded-2xl px-4 py-3 text-sm font-bold break-words ${theme.mobileLink}`}
              >
                {textValue(config, `navigation.${link.anchor}`, link.label)}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}

function SignatureAppSection({
  partner,
  config,
  theme,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  const appUrl = textValue(
    config,
    "content.appDownloadUrl",
    appDownloadUrlForPartner(partner),
  )
  const qrUrl = textValue(config, "content.appQrCodeUrl", BENEFITSI_QR_PLACEHOLDER_SRC)
  const screenshotUrl = textValue(
    config,
    "content.appPhoneScreenshotUrl",
    PARTNER_DETAIL_SCREEN_SRC,
  )
  const proofItems = [
    textValue(config, "content.appBenefit.0", "Stempelstand jederzeit einsehbar"),
    textValue(config, "content.appBenefit.1", "Belohnungen automatisch freischalten"),
    hasAnyPartnerSocials(partner)
      ? "Microsite und Social Discovery verbinden"
      : textValue(config, "content.appBenefit.2", "Einfach, schnell & digital"),
  ]

  return (
    <section id="app" className="scroll-mt-24 px-4 py-8 @min-[640px]:px-7 @min-[1024px]:px-10">
      <div className={`mx-auto min-w-0 max-w-6xl overflow-hidden rounded-[1.25rem] p-4 @min-[640px]:rounded-[1.8rem] @min-[640px]:p-5 @min-[1024px]:p-7 ${theme.panel}`}>
        <div className="grid min-w-0 gap-6 @min-[1024px]:grid-cols-[minmax(180px,.48fr)_minmax(0,1fr)_minmax(190px,.52fr)] @min-[1024px]:items-center">
          <div className="relative isolate mx-auto w-[min(62vw,210px)] rounded-[2.45rem] bg-[#101114] p-2 shadow-[0_24px_54px_rgba(0,0,0,.22)]">
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-5 w-20 -translate-x-1/2 rounded-b-2xl bg-[#101114]" />
            <div
              className="relative isolate aspect-[720/1600] overflow-hidden rounded-[1.95rem] bg-[#101114]"
              style={{ clipPath: "inset(0 round 1.95rem)" }}
            >
              <img
                {...editable("content.appPhoneScreenshotUrl", "image", "App Screenshot im iPhone")}
                src={screenshotUrl}
                alt=""
                className="h-full w-full scale-[1.012] object-cover"
                style={imageStyleFor(config, "content.appPhoneScreenshotUrl")}
              />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <span
                {...editable("content.appKicker.icon", "image", "App-Banner Icon")}
                className={`grid size-11 shrink-0 place-items-center rounded-2xl ${theme.badge}`}
              >
                <img src={BENEFITSI_ICON_SRC} alt="" className="size-7 object-contain" />
              </span>
              <p
                {...editable("content.appKicker", "text", "App-Banner Label")}
                className={`text-xs font-black uppercase leading-5 tracking-[0.08em] @min-[640px]:tracking-[0.14em] ${theme.sectionEyebrow}`}
                style={textStyleFor(config, "content.appKicker")}
              >
                {textValue(config, "content.appKicker", "In der Benefitsi App")}
              </p>
            </div>
            <h2
              {...editable("content.appHeadline", "text", "App-Banner Überschrift")}
              className="mt-4 text-[clamp(1.7rem,8vw,3rem)] font-black leading-[1.04] tracking-normal break-words"
              style={textStyleFor(config, "content.appHeadline")}
            >
              {config.content.appHeadline}
            </h2>
            <p
              {...editable("content.appText", "text", "App-Banner Text")}
              className="mt-4 max-w-2xl text-sm leading-7 break-words opacity-85"
              style={textStyleFor(config, "content.appText")}
            >
              {config.content.appText}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <SignatureStoreBadge store="app-store" href={appUrl} />
              <SignatureStoreBadge store="google-play" href={appUrl} />
            </div>
          </div>

          <div className={`grid min-w-0 gap-4 rounded-[1.25rem] p-4 ${theme.softCard}`}>
            <a
              href={appUrl}
              className="mx-auto aspect-square w-44 max-w-full rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/10"
              aria-label="Benefitsi App QR-Code öffnen"
            >
              <img
                {...editable("content.appQrCodeUrl", "image", "App QR-Code")}
                src={qrUrl}
                alt={`QR-Code zum Öffnen der Benefitsi App für ${partner.name || "diesen Partner"}`}
                className="h-full w-full rounded-xl object-contain"
                style={imageStyleFor(config, "content.appQrCodeUrl")}
              />
            </a>
            <div className="text-center">
              <p
                {...editable("content.appQrLabel", "text", "QR-Code Hinweis")}
                className="text-lg font-black leading-tight break-words"
                style={textStyleFor(config, "content.appQrLabel")}
              >
                {textValue(config, "content.appQrLabel", "App öffnen & einchecken")}
              </p>
              <p
                {...editable("content.appQrText", "text", "QR-Code Text")}
                className="mt-1 text-xs font-black uppercase tracking-[0.12em] opacity-70"
                style={textStyleFor(config, "content.appQrText")}
              >
                {textValue(config, "content.appQrText", "QR-Code scannen")}
              </p>
            </div>
            <ul className="grid gap-2">
              {proofItems.map((item, index) => (
                <li key={`${item}-${index}`} className="flex min-w-0 items-start gap-2 text-sm leading-6">
                  <span className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full ${theme.bulletIcon}`}>
                    <Glyph name="check" className="size-3" />
                  </span>
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function SignatureStoreBadge({
  store,
  href,
}: {
  store: "app-store" | "google-play"
  href: string
}) {
  const isAppStore = store === "app-store"

  return (
    <a
      href={href}
      className="inline-flex min-w-[170px] items-center gap-3 rounded-[0.9rem] bg-black px-4 py-3 text-white shadow-[0_14px_30px_rgba(0,0,0,.18)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-zinc-900"
      aria-label={isAppStore ? "Laden im App Store" : "Jetzt bei Google Play"}
    >
      {isAppStore ? <SignatureAppleGlyph /> : <SignaturePlayGlyph />}
      <span>
        <span className="block text-[10px] font-semibold uppercase leading-none text-zinc-300">
          {isAppStore ? "Laden im" : "Jetzt bei"}
        </span>
        <span className="block text-[1rem] font-black leading-tight">
          {isAppStore ? "App Store" : "Google Play"}
        </span>
      </span>
    </a>
  )
}

function SignatureAppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7" fill="currentColor">
      <path d="M16.46 12.42c-.03-3.03 2.48-4.49 2.6-4.56-1.42-2.07-3.62-2.35-4.39-2.39-1.85-.19-3.64 1.1-4.58 1.1-.96 0-2.41-1.07-3.98-1.04-2.03.03-3.92 1.2-4.96 3.03-2.14 3.7-.55 9.14 1.5 12.13 1.03 1.47 2.23 3.11 3.79 3.05 1.53-.06 2.1-.98 3.95-.98 1.83 0 2.37.98 3.97.95 1.64-.03 2.67-1.48 3.66-2.97 1.19-1.68 1.66-3.34 1.68-3.42-.04-.01-3.2-1.23-3.24-4.9Z" />
      <path d="M13.46 3.5c.83-1.04 1.39-2.45 1.24-3.87-1.2.05-2.7.83-3.56 1.84-.76.88-1.44 2.35-1.26 3.72 1.35.1 2.72-.68 3.58-1.69Z" />
    </svg>
  )
}

function SignaturePlayGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-7">
      <path d="M3.2 2.4 11 10l-7.8 7.6a2 2 0 0 1-.2-.9V3.3c0-.3.1-.6.2-.9Z" fill="#38bdf8" />
      <path d="m11 10 2.4-2.4 3.2 1.8c.6.4.6 1.2 0 1.6l-3.2 1.8L11 10Z" fill="#facc15" />
      <path d="m3.2 2.4 10.2 5.2L11 10 3.2 2.4Z" fill="#22c55e" />
      <path d="M3.2 17.6 11 10l2.4 2.4L3.2 17.6Z" fill="#ef4444" />
    </svg>
  )
}

function appDownloadUrlForPartner(partner: PartnerWithDeals) {
  const partnerSlug = partner.slug || partner.subdomain || partner.short_name || partner.id || "partner"

  return `https://benefitsi.de/app?partner=${encodeURIComponent(partnerSlug)}`
}

function SignatureMeta({
  id,
  label,
  value,
  icon,
  config,
  theme,
}: {
  id: string
  label: string
  value: string
  icon: string
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  return (
    <div className={`min-w-0 rounded-[1.2rem] px-4 py-3 ${theme.metaCard}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${theme.badge}`}>
          <Glyph name={icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase leading-4 tracking-[0.08em] opacity-65 @min-[640px]:tracking-[0.12em]">
            {label}
          </p>
          <p
            {...editable(id, "text", label)}
            className="mt-1 text-sm font-semibold leading-6 break-words"
            style={textStyleFor(config, id)}
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function HighlightCard({
  card,
  index,
  config,
  theme,
}: {
  card: SignatureCard
  index: number
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  return (
    <div className={`min-w-0 rounded-[1.2rem] p-4 ${theme.softCard}`}>
      <span className={`grid size-10 place-items-center rounded-2xl ${theme.badge}`}>
        <Glyph name={card.icon} className="size-5" />
      </span>
      <p
        {...editable(`content.aboutValue.${index}`, "text", `Über uns Wert ${index + 1}`)}
        className="mt-3 text-sm font-black break-words"
        style={textStyleFor(config, `content.aboutValue.${index}`)}
      >
        {card.title}
      </p>
      <p className="mt-2 text-xs leading-5 break-words opacity-75">{card.text}</p>
    </div>
  )
}

function FeatureCard({
  card,
  index,
  config,
  theme,
}: {
  card: SignatureCard
  index: number
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  return (
    <article className={`min-w-0 rounded-[1.25rem] p-4 @min-[640px]:rounded-[1.4rem] @min-[640px]:p-5 ${theme.panel}`}>
      <div className="flex min-w-0 items-start gap-4">
        <span className={`grid size-12 shrink-0 place-items-center rounded-[1rem] ${theme.badge}`}>
          <Glyph name={card.icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <h3
            {...editable(`hero.services.${Math.min(index, Math.max(config.hero.services.length - 1, 0))}.label`, "text", `Service ${index + 1}`)}
            className="text-base font-black tracking-normal break-words"
          >
            {card.title}
          </h3>
          <p className="mt-2 text-sm leading-6 break-words opacity-80">{card.text}</p>
        </div>
      </div>
    </article>
  )
}

function ContactRow({
  id,
  label,
  value,
  config,
  theme,
}: {
  id: string
  label: string
  value: string
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  return (
    <div className={`min-w-0 rounded-2xl px-4 py-3 ${theme.contactRow}`}>
      <p className="text-[10px] font-black uppercase leading-4 tracking-[0.08em] opacity-60 @min-[640px]:tracking-[0.12em]">{label}</p>
      <p
        {...editable(id, "text", label)}
        className="mt-1 text-sm font-semibold leading-6 break-words"
        style={textStyleFor(config, id)}
      >
        {textValue(config, id, value)}
      </p>
    </div>
  )
}

function SocialPill({
  platform,
  label,
  partner,
  config,
  theme,
}: {
  platform: string
  label: string
  partner: PartnerWithDeals
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  const id = `social.${platform}`
  const href = textValue(config, `${id}.url`, partnerSocialUrl(partner, platform))
  const displayLabel = textValue(
    config,
    `${id}.label`,
    partnerSocialLabel(partner, platform) || label,
  )

  if (!href) {
    return null
  }

  return (
    <a
      {...editable(id, "group", `${label} Social-Media-Schaltfläche`)}
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className={`inline-flex min-w-0 max-w-full items-center gap-3 rounded-full px-4 py-3 text-sm font-bold shadow-sm transition ${theme.socialPill}`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full ${
          platform === "whatsapp" ? "bg-[#25d366] text-white" : theme.badge
        }`}
      >
        <Glyph name={platform} className="size-4" />
      </span>
      <span
        {...editable(`${id}.label`, "text", `${label} Label`)}
        className="min-w-0 break-words"
        style={textStyleFor(config, `${id}.label`)}
      >
        {displayLabel}
      </span>
    </a>
  )
}

function HeroAction({
  id,
  href,
  label,
  config,
  theme,
  primary,
}: {
  id: string
  href: string
  label: string
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
  primary?: boolean
}) {
  return (
    <a
      href={href}
      className={`inline-flex w-full min-w-0 max-w-full items-center justify-center rounded-full px-5 py-3 text-center text-sm font-black transition @min-[640px]:w-auto ${
        primary ? theme.ctaButton : theme.secondaryButton
      }`}
    >
      <span
        {...editable(id, "text", primary ? "Primärer Button" : "Sekundärer Button")}
        className="min-w-0 break-words"
        style={textStyleFor(config, id)}
      >
        {label}
      </span>
    </a>
  )
}

function FaqRow({
  index,
  item,
  config,
  theme,
}: {
  index: number
  item: { question: string; answer: string }
  config: MicrositeConfig
  theme: ReturnType<typeof themeForTemplate>
}) {
  return (
    <details className={`min-w-0 rounded-[1.2rem] p-4 ${theme.softCard}`} open={index === 0}>
      <summary
        {...editable(`content.faq.${index}.question`, "text", `FAQ Frage ${index + 1}`)}
        className="cursor-pointer list-none text-base font-black tracking-normal break-words"
        style={textStyleFor(config, `content.faq.${index}.question`)}
      >
        {textValue(config, `content.faq.${index}.question`, item.question)}
      </summary>
      <p
        {...editable(`content.faq.${index}.answer`, "text", `FAQ Antwort ${index + 1}`)}
        className="mt-3 text-sm leading-7 break-words opacity-80"
        style={textStyleFor(config, `content.faq.${index}.answer`)}
      >
        {textValue(config, `content.faq.${index}.answer`, item.answer)}
      </p>
    </details>
  )
}

function signatureCardsForPartner(
  partner: PartnerWithDeals,
  config: MicrositeConfig,
  profile: SignatureProfile,
) {
  const menuItems = partner.menus.flatMap((menu) =>
    menu.categories.length
      ? menu.categories.flatMap((category) => category.items)
      : menu.items,
  )
  const dealCards = partner.deals
    .filter((deal) => deal.active !== false)
    .slice(0, 3)
    .map((deal, index) => ({
      id: deal.id || `deal-${index}`,
      title: deal.reward_item || deal.customer_description || `Angebot ${index + 1}`,
      text: deal.terms || deal.staff_instructions || "Wird über Benefitsi beworben",
      icon: profile === "cinema" ? "star" : profile === "wellness" ? "leaf" : "spark",
    }))
  const menuCards = menuItems.slice(0, 4).map((item, index) => ({
    id: item.id || `menu-${index}`,
    title: item.name || config.hero.services[index]?.label || `Highlight ${index + 1}`,
    text: item.description || item.tags?.slice(0, 3).join(" · ") || "Beliebt bei Gästen",
    icon: profile === "wellness" ? "leaf" : profile === "cinema" ? "star" : "spark",
  }))
  const serviceCards = config.hero.services.map((item, index) => ({
    id: `service-${index}`,
    title: item.label,
      text:
        partner.category?.[index] ||
        partner.description ||
        (profile === "cinema"
        ? "Für wiederkehrende Besuche und starke Event-Momente gestaltet."
        : profile === "wellness"
          ? "Ein ruhiger, hochwertiger Service-Moment."
          : "So gestaltet, dass es hochwertig und persönlich wirkt."),
    icon: item.icon,
  }))

  return [...menuCards, ...dealCards, ...serviceCards].slice(0, 6)
}

function signatureProfileForTemplate(template: MicrositeConfig["template"]): SignatureProfile {
  if (template === "salon-editorial" || template === "atelier-noir") {
    return "salon"
  }

  if (template === "wellness-serene") {
    return "wellness"
  }

  return "cinema"
}

function socialVisible(
  config: MicrositeConfig,
  partner: PartnerWithDeals,
  platform: string,
) {
  const explicit = config.elementText[`social.${platform}.enabled`]

  if (explicit === "true") {
    return true
  }

  if (explicit === "false") {
    return false
  }

  return Boolean(partnerSocialUrl(partner, platform))
}

function themeForTemplate(template: MicrositeConfig["template"]) {
  if (template === "atelier-noir") {
    return {
      shell: "bg-[radial-gradient(circle_at_78%_0%,rgba(244,114,182,.16),transparent_30%),radial-gradient(circle_at_10%_10%,rgba(251,191,36,.12),transparent_28%),linear-gradient(135deg,#120e13_0%,#1a1118_48%,#0d0b10_100%)] text-[#fffaf4] shadow-none",
      heroSection: "bg-transparent",
      heroImageClass: "opacity-24 saturate-[1.08] @min-[1024px]:opacity-38",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(18,14,19,.99)_0%,rgba(18,14,19,.94)_38%,rgba(18,14,19,.54)_70%,rgba(18,14,19,.18)_100%)]",
      eyebrow: "bg-[#f6d08a] text-[#1c1117] ring-1 ring-inset ring-white/[.18]",
      heroTitle: "text-[#fff7ed]",
      heroSlogan: "text-[#f9cde0]",
      heroCard: "bg-[#241821] text-[#fffaf4] shadow-none ring-1 ring-inset ring-[#f6d08a]/[.18]",
      panel: "bg-[#1d151d] text-[#fffaf4] shadow-none ring-1 ring-inset ring-[#f6d08a]/[.14]",
      mediaPanel: "bg-[#2b2028] shadow-none ring-1 ring-inset ring-white/[.10]",
      softCard: "bg-[#2a2029] text-[#fffaf4] shadow-none ring-1 ring-inset ring-white/[.09]",
      callout: "bg-[linear-gradient(135deg,#f6d08a_0%,#f4a7c9_52%,#d8b4fe_100%)] text-[#1a1016] shadow-none",
      sectionEyebrow: "text-[#f6d08a]",
      badge: "bg-[#f6d08a]/[.14] text-[#f9d99b]",
      bulletIcon: "bg-[#f6d08a] text-[#1b1321]",
      metaCard: "bg-[#2a2029] shadow-none ring-1 ring-inset ring-white/[.09]",
      footer: "bg-[#1d151d] shadow-none ring-1 ring-inset ring-[#f6d08a]/[.14]",
      contactRow: "bg-[#2a2029] shadow-none ring-1 ring-inset ring-white/[.09]",
      ctaButton: "bg-[#f6d08a] text-[#1b1321] hover:bg-[#ffe1a7]",
      secondaryButton: "bg-white/[.08] text-white ring-1 ring-inset ring-white/[.12] hover:bg-white/[.13]",
      navLink: "bg-white/[.08] text-zinc-100 hover:bg-white/[.14]",
      socialPill: "bg-white/[.08] text-zinc-100 hover:bg-white/[.14]",
      header: "bg-[#131018]/90 text-white shadow-[0_1px_0_rgba(246,208,138,.14)]",
      mobileMenu: "bg-white/[.08] text-white ring-1 ring-inset ring-white/[.12]",
      mobilePanel: "bg-[#131018]/95",
      mobileLink: "bg-white/[.08] text-white",
    }
  }

  if (template === "festival-neon") {
    return {
      shell: "bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,.22),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(236,72,153,.2),transparent_30%),linear-gradient(135deg,#05081a_0%,#09112a_48%,#060617_100%)] text-white shadow-none",
      heroSection: "bg-transparent",
      heroImageClass: "opacity-22 saturate-[1.35] contrast-110 @min-[1024px]:opacity-34",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(5,8,26,.99)_0%,rgba(5,8,26,.93)_34%,rgba(5,8,26,.48)_66%,rgba(5,8,26,.16)_100%)]",
      eyebrow: "bg-cyan-300 text-[#061021] ring-1 ring-inset ring-white/[.18]",
      heroTitle: "text-white",
      heroSlogan: "text-cyan-50",
      heroCard: "bg-[#0b1430] text-white shadow-none ring-1 ring-inset ring-cyan-200/[.18]",
      panel: "bg-[#0a122b] text-white shadow-none ring-1 ring-inset ring-cyan-200/[.15]",
      mediaPanel: "bg-[#0e1836] shadow-none ring-1 ring-inset ring-cyan-200/[.14]",
      softCard: "bg-[#101a3a] text-white shadow-none ring-1 ring-inset ring-cyan-200/[.12]",
      callout: "bg-[linear-gradient(135deg,#67e8f9_0%,#a5b4fc_48%,#fb7185_100%)] text-[#07111f] shadow-none",
      sectionEyebrow: "text-cyan-200",
      badge: "bg-cyan-300/[.13] text-cyan-100",
      bulletIcon: "bg-cyan-300 text-[#07111f]",
      metaCard: "bg-[#101a3a] shadow-none ring-1 ring-inset ring-cyan-200/[.14]",
      footer: "bg-[#0a122b] shadow-none ring-1 ring-inset ring-cyan-200/[.15]",
      contactRow: "bg-[#101a3a] shadow-none ring-1 ring-inset ring-cyan-200/[.12]",
      ctaButton: "bg-cyan-300 text-[#07111f] hover:bg-cyan-200",
      secondaryButton: "bg-white/[.08] text-white ring-1 ring-inset ring-white/[.12] hover:bg-white/[.13]",
      navLink: "bg-white/[.08] text-zinc-100 hover:bg-white/[.14]",
      socialPill: "bg-white/[.08] text-zinc-100 hover:bg-white/[.14]",
      header: "bg-[#05081a]/90 text-white shadow-[0_1px_0_rgba(103,232,249,.14)]",
      mobileMenu: "bg-white/[.08] text-white ring-1 ring-inset ring-cyan-200/[.14]",
      mobilePanel: "bg-[#070b1d]/95",
      mobileLink: "bg-white/[.08] text-white",
    }
  }

  if (template === "salon-editorial") {
    return {
      shell: "bg-[radial-gradient(circle_at_90%_0%,rgba(251,113,133,.2),transparent_32%),radial-gradient(circle_at_5%_8%,rgba(180,83,9,.12),transparent_30%),#f7f0ea] text-[#221b18] shadow-[0_30px_90px_rgba(60,37,22,.12)]",
      heroSection: "bg-transparent",
      heroImageClass: "opacity-40 @min-[1024px]:opacity-55",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(247,240,234,.96)_0%,rgba(247,240,234,.88)_38%,rgba(247,240,234,.34)_70%,rgba(247,240,234,.1)_100%)]",
      eyebrow: "bg-white/70 text-amber-900 shadow-sm ring-1 ring-inset ring-white/80",
      heroTitle: "text-[#201714]",
      heroSlogan: "text-[#5c4033]",
      heroCard: "bg-white/72 text-[#201714] shadow-[0_28px_80px_rgba(88,52,32,.14)] ring-1 ring-inset ring-white/75",
      panel: "bg-white/66 text-[#201714] shadow-[0_22px_64px_rgba(88,52,32,.09)] ring-1 ring-inset ring-white/70",
      mediaPanel: "bg-[#d8c4b7] shadow-[0_20px_56px_rgba(88,52,32,.12)] ring-1 ring-inset ring-white/60",
      softCard: "bg-[#f4e9e1]/86 text-[#201714] shadow-[0_14px_36px_rgba(88,52,32,.07)] ring-1 ring-inset ring-white/60",
      callout: "bg-[#221b18] text-white shadow-[0_18px_46px_rgba(34,27,24,.18)]",
      sectionEyebrow: "text-[#9a3412]",
      badge: "bg-[#fff1e7] text-[#9a3412]",
      bulletIcon: "bg-[#9a3412] text-white",
      metaCard: "bg-white/68 shadow-[0_12px_30px_rgba(88,52,32,.08)] ring-1 ring-inset ring-white/70",
      footer: "bg-white/66 shadow-[0_18px_48px_rgba(88,52,32,.09)] ring-1 ring-inset ring-white/70",
      contactRow: "bg-white/58 shadow-sm ring-1 ring-inset ring-white/65",
      ctaButton: "bg-[#201714] text-white hover:bg-[#382a24]",
      secondaryButton: "bg-white/78 text-[#201714] ring-1 ring-inset ring-[#201714]/8 hover:bg-white",
      navLink: "bg-white/70 text-[#201714] hover:bg-white",
      socialPill: "bg-white/70 text-[#201714] hover:bg-white",
      header: "bg-[#f7f0ea]/86 text-[#201714] shadow-[0_1px_0_rgba(255,255,255,.65)]",
      mobileMenu: "bg-white/75 text-[#201714] ring-1 ring-inset ring-white/70",
      mobilePanel: "bg-[#f7f0ea]/95",
      mobileLink: "bg-white/80 text-[#201714]",
    }
  }

  if (template === "wellness-serene") {
    return {
      shell: "bg-[radial-gradient(circle_at_90%_0%,rgba(147,197,253,.2),transparent_32%),radial-gradient(circle_at_8%_0%,rgba(15,118,110,.13),transparent_30%),#eef6f2] text-[#102824] shadow-[0_30px_90px_rgba(10,44,40,.12)]",
      heroSection: "bg-transparent",
      heroImageClass: "opacity-35 @min-[1024px]:opacity-50",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(238,246,242,.98)_0%,rgba(238,246,242,.9)_36%,rgba(238,246,242,.42)_68%,rgba(238,246,242,.12)_100%)]",
      eyebrow: "bg-white/70 text-[#115e59] shadow-sm ring-1 ring-inset ring-white/75",
      heroTitle: "text-[#0f2522]",
      heroSlogan: "text-[#28564f]",
      heroCard: "bg-white/72 text-[#0f2522] shadow-[0_28px_76px_rgba(10,44,40,.12)] ring-1 ring-inset ring-white/75",
      panel: "bg-white/68 text-[#0f2522] shadow-[0_22px_62px_rgba(10,44,40,.08)] ring-1 ring-inset ring-white/72",
      mediaPanel: "bg-[#cfe4df] shadow-[0_20px_56px_rgba(10,44,40,.11)] ring-1 ring-inset ring-white/65",
      softCard: "bg-[#e4f1ec]/88 text-[#0f2522] shadow-[0_14px_36px_rgba(10,44,40,.07)] ring-1 ring-inset ring-white/62",
      callout: "bg-[#10302b] text-white shadow-[0_18px_46px_rgba(16,48,43,.18)]",
      sectionEyebrow: "text-[#0f766e]",
      badge: "bg-[#d9f5ee] text-[#0f766e]",
      bulletIcon: "bg-[#0f766e] text-white",
      metaCard: "bg-white/68 shadow-[0_12px_30px_rgba(10,44,40,.08)] ring-1 ring-inset ring-white/72",
      footer: "bg-white/68 shadow-[0_18px_48px_rgba(10,44,40,.08)] ring-1 ring-inset ring-white/72",
      contactRow: "bg-white/58 shadow-sm ring-1 ring-inset ring-white/68",
      ctaButton: "bg-[#0f2522] text-white hover:bg-[#19463f]",
      secondaryButton: "bg-white/78 text-[#0f2522] ring-1 ring-inset ring-[#0f2522]/8 hover:bg-white",
      navLink: "bg-white/70 text-[#0f2522] hover:bg-white",
      socialPill: "bg-white/70 text-[#0f2522] hover:bg-white",
      header: "bg-[#eef6f2]/86 text-[#0f2522] shadow-[0_1px_0_rgba(255,255,255,.68)]",
      mobileMenu: "bg-white/75 text-[#0f2522] ring-1 ring-inset ring-white/70",
      mobilePanel: "bg-[#eef6f2]/95",
      mobileLink: "bg-white/80 text-[#0f2522]",
    }
  }

  return {
    shell: "bg-[radial-gradient(circle_at_76%_0%,rgba(225,29,72,.2),transparent_30%),radial-gradient(circle_at_8%_0%,rgba(250,204,21,.1),transparent_28%),linear-gradient(135deg,#090a12_0%,#121225_52%,#090a13_100%)] text-white shadow-none",
    heroSection: "bg-transparent",
    heroImageClass: "opacity-24 saturate-[1.15] contrast-110 @min-[1024px]:opacity-38",
    heroOverlay: "bg-[linear-gradient(90deg,rgba(9,10,18,.99)_0%,rgba(9,10,18,.92)_36%,rgba(9,10,18,.48)_68%,rgba(9,10,18,.18)_100%)]",
    eyebrow: "bg-rose-500 text-white ring-1 ring-inset ring-white/[.16]",
    heroTitle: "text-white",
    heroSlogan: "text-zinc-100",
    heroCard: "bg-[#171827] text-white shadow-none ring-1 ring-inset ring-rose-200/[.13]",
    panel: "bg-[#141525] text-white shadow-none ring-1 ring-inset ring-rose-200/[.12]",
    mediaPanel: "bg-[#1b1c2d] shadow-none ring-1 ring-inset ring-white/[.10]",
    softCard: "bg-[#1d1f32] text-white shadow-none ring-1 ring-inset ring-white/[.10]",
    callout: "bg-[linear-gradient(135deg,#f43f5e_0%,#8b5cf6_58%,#facc15_100%)] text-white shadow-none",
    sectionEyebrow: "text-rose-300",
    badge: "bg-rose-500/[.14] text-rose-100",
    bulletIcon: "bg-rose-500 text-white",
    metaCard: "bg-[#1d1f32] shadow-none ring-1 ring-inset ring-white/[.10]",
    footer: "bg-[#141525] shadow-none ring-1 ring-inset ring-rose-200/[.12]",
    contactRow: "bg-[#1d1f32] shadow-none ring-1 ring-inset ring-white/[.10]",
    ctaButton: "bg-white text-[#111322] hover:bg-zinc-100",
    secondaryButton: "bg-white/[.08] text-white ring-1 ring-inset ring-white/[.12] hover:bg-white/[.13]",
    navLink: "bg-white/[.08] text-zinc-100 hover:bg-white/[.14]",
    socialPill: "bg-white/[.08] text-zinc-100 hover:bg-white/[.14]",
    header: "bg-[#090a12]/90 text-white shadow-[0_1px_0_rgba(255,255,255,.08)]",
    mobileMenu: "bg-white/[.08] text-white ring-1 ring-inset ring-white/[.12]",
    mobilePanel: "bg-[#0e1020]/95",
    mobileLink: "bg-white/[.08] text-white",
  }
}

function editable(id: string, kind: string, label: string) {
  return {
    "data-microsite-editable": id,
    "data-microsite-editable-kind": kind,
    "data-microsite-editable-label": label,
  }
}

function textValue(config: MicrositeConfig, id: string, fallback: string) {
  return config.elementText[id] || fallback
}

function spacingStyleFor(config: MicrositeConfig, id: string): CSSProperties {
  const style = config.elementStyles[id]

  return {
    marginTop: style?.marginTop ? `${style.marginTop}px` : undefined,
    marginBottom: style?.marginBottom ? `${style.marginBottom}px` : undefined,
  }
}

function textStyleFor(config: MicrositeConfig, id: string): CSSProperties {
  const style = config.elementStyles[id]

  if (!style) {
    return {}
  }

  return {
    ...baseElementStyle(style),
    maxWidth: style.maxWidth ? `min(${style.maxWidth}px, 100%)` : undefined,
    ...spacingStyleFor(config, id),
  }
}

function imageStyleFor(config: MicrositeConfig, id: string): CSSProperties {
  const style = config.elementStyles[id]

  if (!style?.imageScale) {
    return {}
  }

  return {
    transform: `scale(${style.imageScale / 100})`,
    transformOrigin: "center",
  }
}

function navigationGroupStyleFor(config: MicrositeConfig): CSSProperties {
  const style = config.elementStyles["navigation.group"]

  return {
    gap: style?.gap !== undefined ? `${style.gap}px` : undefined,
    transform: style?.xOffset ? `translateX(${style.xOffset}px)` : undefined,
    ...baseElementStyle(style ?? {}),
  }
}

function baseElementStyle(style: MicrositeElementStyle): CSSProperties {
  return {
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    color: style.color,
    fontWeight: style.bold ? 800 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: style.underline ? "underline" : undefined,
    fontFamily: style.fontFamily,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  }
}

function Glyph({ name, className }: { name: string; className?: string }) {
  if (name === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    )
  }

  if (name === "__legacy-whatsapp") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="currentColor">
        <path d="M16 3.2A12.4 12.4 0 0 0 5.4 22l-1.7 6.3 6.5-1.7A12.4 12.4 0 1 0 16 3.2Zm0 22.6c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.8 1 1-3.7-.2-.4A10.1 10.1 0 1 1 16 25.8Zm5.8-7.5c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.8.2l-1 1.2c-.2.3-.4.3-.7.1-2-.9-3.3-2-4.4-4-.2-.3 0-.5.2-.8l.7-.8c.2-.2.2-.4.1-.7l-1-2.3c-.2-.6-.5-.5-.8-.5h-.7c-.2 0-.7.1-1 .5-.3.3-1.3 1.3-1.3 3.1s1.3 3.6 1.5 3.9c.2.3 2.6 4.1 6.4 5.7.9.4 1.6.6 2.2.7.9.3 1.7.2 2.3.1.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.5Z" />
      </svg>
    )
  }

  const paths: Record<string, ReactElement> = {
    spark: <path d="m12 3 1.7 5.3H19l-4.3 3.1 1.6 5.1L12 13.3l-4.3 3.2 1.6-5.1L5 8.3h5.3L12 3Z" />,
    leaf: <path d="M18.5 5.5c-5.4.2-9.7 3.4-12.2 8.9-.7 1.5-1.1 3-1.3 4.6 1.6-.2 3.1-.6 4.6-1.3 5.5-2.5 8.7-6.8 8.9-12.2ZM7.8 16.1c2-2.4 4.6-4.9 8.4-7.1" />,
    clock: <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.8v4.7l3.1 1.8" />
    </>,
    phone: <path d="M7.2 4.8 9.4 4c.7-.3 1.4.1 1.7.8l.8 2c.2.6.1 1.2-.4 1.6l-1.2 1c.9 1.8 2.4 3.3 4.2 4.2l1-1.2c.4-.5 1-.6 1.6-.4l2 .8c.7.3 1.1 1 .8 1.7l-.8 2.2c-.3.8-1 1.3-1.8 1.2C11.4 17.5 6.5 12.6 6 6.7c-.1-.8.4-1.6 1.2-1.9Z" />,
    pin: <>
      <path d="M18 10c0 4.4-6 8.5-6 8.5S6 14.4 6 10a6 6 0 1 1 12 0Z" />
      <circle cx="12" cy="10" r="1.8" />
    </>,
    star: <path d="m12 2.8 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L3 9.4l6.2-.9L12 2.8Z" />,
    smile: <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.8 13.6c1.1 1.4 2.2 2 3.2 2s2.1-.6 3.2-2M9.2 9.5h.1M14.7 9.5h.1" />
    </>,
    check: <path d="m7.7 12.2 2.6 2.6 6-6.2" />,
    card: <>
      <rect x="4" y="6.5" width="16" height="11" rx="2" />
      <path d="M4 10h16" />
    </>,
    bag: <>
      <path d="M6.5 8.5h11l-1 10h-9l-1-10Z" />
      <path d="M9 8.5a3 3 0 0 1 6 0" />
    </>,
    people: <>
      <circle cx="9" cy="10" r="2.2" />
      <circle cx="15.3" cy="9.4" r="1.8" />
      <path d="M5.8 17c.4-2.1 1.9-3.4 3.8-3.4s3.4 1.3 3.8 3.4M13.2 16.5c.3-1.6 1.3-2.6 2.9-2.8 1.3-.1 2.4.8 2.9 2.8" />
    </>,
    menu: <>
      <path d="M5 7h14M5 12h14M5 17h14" />
    </>,
    instagram: <>
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="16.4" cy="7.7" r="1" fill="currentColor" stroke="none" />
    </>,
    facebook: <path d="M13.7 20v-7.1h2.3l.4-2.8h-2.7V8.5c0-.8.2-1.4 1.4-1.4H16V4.7c-.2 0-.9-.1-1.7-.1-2.2 0-3.7 1.3-3.7 3.8V10H8.3v2.8h2.3V20h3.1Z" />,
    tiktok: <path d="M14.7 4c.3 1.9 1.4 3 3.3 3.2v2.6c-1.2.1-2.3-.2-3.3-.9v4.9c0 2.5-1.6 4.7-4.4 4.7-2.5 0-4.3-1.7-4.3-4.2 0-3 2.9-5 5.6-4.1v2.8c-1.1-.4-2.4.3-2.4 1.5 0 .9.7 1.5 1.5 1.5.9 0 1.5-.6 1.5-1.8V4h2.5Z" />,
    whatsapp: <path d="M12 3.4a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.4-1.2A8.5 8.5 0 1 0 12 3.4Zm0 14.3c-1.3 0-2.4-.3-3.4-1l-.3-.1-2.2.6.6-2.1-.2-.3A6.5 6.5 0 1 1 12 17.7Zm3.7-4.8c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1-1.2-.6-2-1.1-2.7-2.3-.2-.3 0-.4.1-.6l.4-.5c.1-.2.1-.3 0-.5l-.6-1.3c-.1-.4-.3-.3-.5-.3h-.4c-.2 0-.5.1-.7.3-.2.2-.8.8-.8 1.9s.8 2.3.9 2.5c.1.2 1.7 2.7 4.2 3.8.6.2 1.1.4 1.5.5.6.2 1.2.1 1.6.1.5-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1-.1-.1-.3-.2-.5-.3Z" />,
    youtube: <path d="M19.7 8.7a2.8 2.8 0 0 0-2-2c-1.7-.5-5.7-.5-5.7-.5s-4 0-5.7.5a2.8 2.8 0 0 0-2 2A28 28 0 0 0 3.8 12c0 1.1.1 2.2.5 3.3a2.8 2.8 0 0 0 2 2c1.7.5 5.7.5 5.7.5s4 0 5.7-.5a2.8 2.8 0 0 0 2-2c.4-1.1.5-2.2.5-3.3s-.1-2.2-.5-3.3ZM10.3 15V9l5.2 3-5.2 3Z" />,
    linkedin: <path d="M6.4 8.9V18H4.1V8.9h2.3ZM5.2 4A1.4 1.4 0 1 1 5.2 6.8 1.4 1.4 0 0 1 5.2 4Zm5 4.9V10c.5-.8 1.3-1.4 2.6-1.4 1.9 0 3.3 1.2 3.3 3.9V18h-2.3v-5.2c0-1.2-.4-2-1.5-2-.8 0-1.3.5-1.5 1.1-.1.2-.1.5-.1.7V18H8.4V8.9h1.8Z" />,
    website: <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8S14.2 17.7 12 20c-2.2-2.3-3.3-5-3.3-8S9.8 6.3 12 4Z" />
    </>,
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name] ?? paths.spark}
    </svg>
  )
}

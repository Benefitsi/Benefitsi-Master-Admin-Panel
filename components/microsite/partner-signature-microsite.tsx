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
      className={`relative overflow-hidden rounded-[1.8rem] ${theme.shell}`}
      style={
        {
          "--site-accent": config.branding.accent,
          "--site-secondary": config.branding.accentSecondary,
        } as CSSProperties
      }
    >
      <SignatureHeader partner={partner} config={config} theme={theme} />

      <section className={`relative overflow-hidden px-5 pb-10 pt-6 sm:px-7 lg:px-10 lg:pb-14 lg:pt-8 ${theme.heroSection}`}>
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

        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] lg:items-end">
          <div className="min-w-0">
            <p
              {...editable("hero.badgeText", "text", "Badge-Text")}
              className={`inline-flex max-w-full rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${theme.eyebrow} break-words`}
              style={textStyleFor(config, "hero.badgeText")}
            >
              {config.hero.badgeText}
            </p>
            <h1
              {...editable("hero.headline", "text", "Startbereich Überschrift")}
              className={`mt-5 max-w-[12ch] text-[clamp(2.7rem,7vw,5.4rem)] font-black leading-[0.94] tracking-[-0.07em] break-words ${theme.heroTitle}`}
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

            <div className="mt-6 flex flex-wrap gap-3">
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

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
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

          <div className={`min-w-0 rounded-[1.6rem] border p-4 shadow-2xl backdrop-blur-xl ${theme.heroCard}`}>
            <div className="grid gap-3 sm:grid-cols-2">
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
                className="text-lg font-black tracking-[-0.03em] break-words"
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

      <section id="deals" className="scroll-mt-24 px-5 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div className={`rounded-[1.6rem] border p-5 ${theme.panel}`}>
            <p
              {...editable("deals.label", "text", "Deals-Label")}
              className={`text-xs font-black uppercase tracking-[0.18em] ${theme.sectionEyebrow}`}
              style={textStyleFor(config, "deals.label")}
            >
              {config.deals.label}
            </p>
            <h2
              {...editable("deals.topDealHeadline", "text", "Top-Deal Überschrift")}
              className="mt-3 text-[clamp(2rem,4vw,3rem)] font-black leading-[1.02] tracking-[-0.06em] break-words"
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

          <div className={`overflow-hidden rounded-[1.6rem] border ${theme.mediaPanel}`}>
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

      <section id="speisekarte" className="scroll-mt-24 px-5 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p
                {...editable("content.menuLabel", "text", "Speisekarte Label")}
                className={`text-xs font-black uppercase tracking-[0.18em] ${theme.sectionEyebrow}`}
                style={textStyleFor(config, "content.menuLabel")}
              >
                {config.content.menuLabel}
              </p>
              <h2
                {...editable("content.menuHeadline", "text", "Speisekarte Überschrift")}
                className="mt-3 text-[clamp(2rem,4vw,3rem)] font-black leading-[1.02] tracking-[-0.06em] break-words"
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

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

      <section id="ueber-uns" className="scroll-mt-24 px-5 py-8 sm:px-7 lg:px-10">
        <div className={`mx-auto grid max-w-6xl gap-5 rounded-[1.8rem] border p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.78fr)] lg:p-8 ${theme.panel}`}>
          <div className="min-w-0">
            <p
              {...editable("content.aboutLabel", "text", "Über uns Label")}
              className={`text-xs font-black uppercase tracking-[0.18em] ${theme.sectionEyebrow}`}
              style={textStyleFor(config, "content.aboutLabel")}
            >
              {config.content.aboutLabel}
            </p>
            <h2
              {...editable("content.aboutHeadline", "text", "Über uns Überschrift")}
              className="mt-3 text-[clamp(2rem,4vw,3rem)] font-black leading-[1.02] tracking-[-0.06em] break-words"
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
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-3">
            <div className={`overflow-hidden rounded-[1.4rem] ${theme.mediaPanel}`}>
              <img
                {...editable("content.aboutHeroImageUrl", "image", "Über uns Hintergrundbild")}
                src={textValue(config, "content.aboutHeroImageUrl", heroImage)}
                alt=""
                className="h-56 w-full object-cover"
                style={imageStyleFor(config, "content.aboutHeroImageUrl")}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`overflow-hidden rounded-[1.25rem] ${theme.mediaPanel}`}>
                <img
                  {...editable("content.aboutIngredientImageUrl", "image", "Über uns Zutatenbild")}
                  src={textValue(config, "content.aboutIngredientImageUrl", config.deals.illustrationUrl || heroImage)}
                  alt=""
                  className="h-40 w-full object-cover"
                  style={imageStyleFor(config, "content.aboutIngredientImageUrl")}
                />
              </div>
              <div className={`overflow-hidden rounded-[1.25rem] ${theme.mediaPanel}`}>
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

      <section id="app" className="scroll-mt-24 px-5 py-8 sm:px-7 lg:px-10">
        <div className={`mx-auto max-w-6xl rounded-[1.8rem] border p-5 lg:p-8 ${theme.panel}`}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,.95fr)_minmax(260px,.55fr)] lg:items-center">
            <div className="min-w-0">
              <p className={`text-xs font-black uppercase tracking-[0.18em] ${theme.sectionEyebrow}`}>
                Benefitsi
              </p>
              <h2
                {...editable("content.appHeadline", "text", "App-Banner Überschrift")}
                className="mt-3 text-[clamp(2rem,4vw,3rem)] font-black leading-[1.02] tracking-[-0.06em] break-words"
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
            </div>
            <div className={`rounded-[1.5rem] border p-5 ${theme.softCard}`}>
              <p className="text-sm font-bold">Warum es wirkt</p>
              <ul className="mt-4 space-y-3">
                {[
                  "Mehr Wiederbesuche auslösen",
                  "Lokale Angebote schneller sichtbar machen",
                  hasAnyPartnerSocials(partner)
                    ? "Microsite und Social Discovery verbinden"
                    : "Social Links mit dem Profil mitwachsen lassen",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6">
                    <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${theme.bulletIcon}`}>
                      <Glyph name="check" className="size-3.5" />
                    </span>
                    <span className="break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="kontakt" className="scroll-mt-24 px-5 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div className={`rounded-[1.8rem] border p-5 lg:p-7 ${theme.panel}`}>
            <p
              {...editable("content.contactLabel", "text", "Kontakt Label")}
              className={`text-xs font-black uppercase tracking-[0.18em] ${theme.sectionEyebrow}`}
              style={textStyleFor(config, "content.contactLabel")}
            >
              {config.content.contactLabel}
            </p>
            <h2
              {...editable("content.contactHeadline", "text", "Kontakt Überschrift")}
              className="mt-3 text-[clamp(2rem,4vw,3rem)] font-black leading-[1.02] tracking-[-0.06em] break-words"
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
              />
              <ContactRow
                id="content.contact.phone"
                label="Telefon"
                value={partner.phone || partner.email || partner.website || "Kontaktdaten folgen"}
                config={config}
              />
              <ContactRow
                id="content.contact.opening"
                label="Öffnungszeiten"
                value={config.hero.openingText}
                config={config}
              />
            </div>
          </div>

          <div className={`rounded-[1.8rem] border p-5 lg:p-7 ${theme.panel}`}>
            <p
              {...editable("content.contactSocialText", "text", "Social-Media-Text")}
              className="text-sm font-semibold leading-6 break-words"
              style={textStyleFor(config, "content.contactSocialText")}
            >
              {textValue(config, "content.contactSocialText", "Bleib für Aktionen, Angebote und lokale Highlights verbunden.")}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
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

            <div className={`mt-6 overflow-hidden rounded-[1.4rem] ${theme.mediaPanel}`}>
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

      <section id="faq" className="scroll-mt-24 px-5 py-8 sm:px-7 lg:px-10">
        <div className={`mx-auto max-w-6xl rounded-[1.8rem] border p-5 lg:p-7 ${theme.panel}`}>
          <p
            {...editable("content.faqLabel", "text", "FAQ-Label")}
            className={`text-xs font-black uppercase tracking-[0.18em] ${theme.sectionEyebrow}`}
            style={textStyleFor(config, "content.faqLabel")}
          >
            {textValue(config, "content.faqLabel", "FAQ")}
          </p>
          <h2
            {...editable("content.faqHeadline", "text", "FAQ Überschrift")}
            className="mt-3 text-[clamp(2rem,4vw,3rem)] font-black leading-[1.02] tracking-[-0.06em] break-words"
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

      <footer className="px-5 pb-8 pt-4 sm:px-7 lg:px-10">
        <div className={`mx-auto flex max-w-6xl flex-col gap-4 rounded-[1.5rem] border px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${theme.footer}`}>
          <div className="min-w-0">
            <p className="text-sm font-black tracking-[-0.03em] break-words">
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
            className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-black transition ${theme.ctaButton}`}
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
      className={`sticky top-0 z-30 border-b backdrop-blur-xl ${theme.header}`}
      style={{
        minHeight: config.elementStyles["navigation.group"]?.height
          ? `${config.elementStyles["navigation.group"]?.height}px`
          : undefined,
        ...spacingStyleFor(config, "navigation.group"),
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-7 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <img
            {...editable("branding.logo", "group", "Logo (Partnerprofil)")}
            src={config.branding.logoUrl || partner.logo_url || "/Benefitsi_Icon_FullColor_RGB_512.png"}
            alt=""
            className="size-11 rounded-2xl object-cover"
          />
          <div className="min-w-0">
            <p
              {...editable("branding.partnerName", "text", "Partnername")}
              className="truncate text-sm font-black tracking-[-0.03em]"
              style={textStyleFor(config, "branding.partnerName")}
            >
              {textValue(config, "branding.partnerName", partner.name || config.hero.headline)}
            </p>
            <p className="truncate text-xs opacity-70">{config.hero.locationText}</p>
          </div>
        </div>

        <nav
          className="hidden min-w-0 items-center gap-2 lg:flex"
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
          className={`grid size-10 place-items-center rounded-full border lg:hidden ${theme.mobileMenu}`}
        >
          <Glyph name="menu" className="size-5" />
        </button>
      </div>

      {menuOpen ? (
        <div className="border-t px-5 py-3 lg:hidden">
          <div className="grid gap-2">
            {config.navigation.links.map((link) => (
              <a
                key={link.anchor}
                href={`#${link.anchor}`}
                onClick={() => setMenuOpen(false)}
                className={`rounded-2xl px-4 py-3 text-sm font-bold ${theme.mobileLink}`}
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
    <div className={`rounded-[1.2rem] border px-4 py-3 ${theme.metaCard}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${theme.badge}`}>
          <Glyph name={icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-65">
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
    <div className={`rounded-[1.2rem] p-4 ${theme.softCard}`}>
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
    <article className={`rounded-[1.4rem] border p-5 ${theme.panel}`}>
      <div className="flex items-start gap-4">
        <span className={`grid size-12 shrink-0 place-items-center rounded-[1rem] ${theme.badge}`}>
          <Glyph name={card.icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <h3
            {...editable(`hero.services.${Math.min(index, Math.max(config.hero.services.length - 1, 0))}.label`, "text", `Service ${index + 1}`)}
            className="text-base font-black tracking-[-0.03em] break-words"
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
}: {
  id: string
  label: string
  value: string
  config: MicrositeConfig
}) {
  return (
    <div className="rounded-2xl border border-current/10 bg-white/40 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{label}</p>
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
      className={`inline-flex min-w-0 items-center gap-3 rounded-full border px-4 py-3 text-sm font-bold transition ${theme.socialPill}`}
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${theme.badge}`}>
        <Glyph name={platform} className="size-4" />
      </span>
      <span
        {...editable(`${id}.label`, "text", `${label} Label`)}
        className="truncate"
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
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-black transition ${
        primary ? theme.ctaButton : theme.secondaryButton
      }`}
    >
      <span {...editable(id, "text", primary ? "Primärer Button" : "Sekundärer Button")} style={textStyleFor(config, id)}>
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
    <details className={`rounded-[1.2rem] border p-4 ${theme.softCard}`} open={index === 0}>
      <summary
        {...editable(`content.faq.${index}.question`, "text", `FAQ Frage ${index + 1}`)}
        className="cursor-pointer list-none text-base font-black tracking-[-0.03em] break-words"
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
      shell: "bg-[#131018] text-[#f8f4ef] shadow-[0_30px_90px_rgba(14,10,20,.38)]",
      heroSection: "bg-[#131018]",
      heroImageClass: "opacity-28 lg:opacity-42",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(19,16,24,.98)_0%,rgba(19,16,24,.9)_36%,rgba(19,16,24,.42)_68%,rgba(19,16,24,.12)_100%)]",
      eyebrow: "border-white/12 bg-white/8 text-amber-200",
      heroTitle: "text-[#fff7ed]",
      heroSlogan: "text-[#fbcfe8]",
      heroCard: "border-white/10 bg-white/7 text-[#fff7ed]",
      panel: "border-white/10 bg-white/6 text-[#fff7ed]",
      mediaPanel: "border-white/10 bg-[#231b2c]",
      softCard: "bg-white/8 text-[#fff7ed]",
      callout: "bg-gradient-to-br from-amber-400 via-rose-400 to-fuchsia-500 text-[#1b1321]",
      sectionEyebrow: "text-amber-200",
      badge: "bg-white/10 text-amber-100",
      bulletIcon: "bg-amber-400 text-[#1b1321]",
      metaCard: "border-white/12 bg-white/7",
      footer: "border-white/10 bg-white/6",
      ctaButton: "bg-white text-[#1b1321] hover:bg-zinc-100",
      secondaryButton: "border border-white/12 bg-white/8 text-white hover:bg-white/12",
      navLink: "bg-white/8 text-zinc-100 hover:bg-white/14",
      socialPill: "bg-white/8 text-zinc-100 hover:bg-white/14",
      header: "border-white/10 bg-[#131018]/88 text-white",
      mobileMenu: "border-white/12 bg-white/8 text-white",
      mobileLink: "bg-white/8 text-white",
    }
  }

  if (template === "festival-neon") {
    return {
      shell: "bg-[#070b1d] text-white shadow-[0_30px_90px_rgba(4,8,24,.42)]",
      heroSection: "bg-[#070b1d]",
      heroImageClass: "opacity-24 lg:opacity-36",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(7,11,29,.98)_0%,rgba(7,11,29,.9)_34%,rgba(7,11,29,.44)_66%,rgba(7,11,29,.14)_100%)]",
      eyebrow: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
      heroTitle: "text-white",
      heroSlogan: "text-cyan-100/90",
      heroCard: "border-cyan-300/16 bg-white/7 text-white",
      panel: "border-cyan-300/16 bg-white/6 text-white",
      mediaPanel: "border-cyan-300/14 bg-[#11172f]",
      softCard: "bg-white/8 text-white",
      callout: "bg-[linear-gradient(135deg,#22d3ee_0%,#818cf8_48%,#f43f5e_100%)] text-[#07111f]",
      sectionEyebrow: "text-cyan-200",
      badge: "bg-white/10 text-cyan-100",
      bulletIcon: "bg-cyan-300 text-[#07111f]",
      metaCard: "border-cyan-300/14 bg-white/7",
      footer: "border-cyan-300/14 bg-white/6",
      ctaButton: "bg-cyan-300 text-[#07111f] hover:bg-cyan-200",
      secondaryButton: "border border-white/12 bg-white/8 text-white hover:bg-white/12",
      navLink: "bg-white/8 text-zinc-100 hover:bg-white/14",
      socialPill: "bg-white/8 text-zinc-100 hover:bg-white/14",
      header: "border-cyan-300/14 bg-[#070b1d]/90 text-white",
      mobileMenu: "border-cyan-300/14 bg-white/8 text-white",
      mobileLink: "bg-white/8 text-white",
    }
  }

  if (template === "salon-editorial") {
    return {
      shell: "bg-[#f7f0ea] text-[#221b18] shadow-[0_30px_90px_rgba(60,37,22,.12)]",
      heroSection: "bg-[#f3ece5]",
      heroImageClass: "opacity-40 lg:opacity-55",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(247,240,234,.96)_0%,rgba(247,240,234,.88)_38%,rgba(247,240,234,.34)_70%,rgba(247,240,234,.1)_100%)]",
      eyebrow: "border-amber-900/10 bg-white/75 text-amber-900",
      heroTitle: "text-[#201714]",
      heroSlogan: "text-[#5c4033]",
      heroCard: "border-white/80 bg-white/72 text-[#201714]",
      panel: "border-white/90 bg-white/72 text-[#201714]",
      mediaPanel: "border-white/80 bg-[#d8c4b7]",
      softCard: "bg-[#f2e8e0] text-[#201714]",
      callout: "bg-[#221b18] text-white",
      sectionEyebrow: "text-[#9a3412]",
      badge: "bg-[#fff1e7] text-[#9a3412]",
      bulletIcon: "bg-[#9a3412] text-white",
      metaCard: "border-white/80 bg-white/70",
      footer: "border-white/80 bg-white/70",
      ctaButton: "bg-[#201714] text-white hover:bg-[#382a24]",
      secondaryButton: "border border-[#201714]/10 bg-white/80 text-[#201714] hover:bg-white",
      navLink: "bg-white/70 text-[#201714] hover:bg-white",
      socialPill: "bg-white/70 text-[#201714] hover:bg-white",
      header: "border-white/70 bg-[#f7f0ea]/88 text-[#201714]",
      mobileMenu: "border-white/80 bg-white/75 text-[#201714]",
      mobileLink: "bg-white/80 text-[#201714]",
    }
  }

  if (template === "wellness-serene") {
    return {
      shell: "bg-[#eef6f2] text-[#102824] shadow-[0_30px_90px_rgba(10,44,40,.12)]",
      heroSection: "bg-[#edf7f4]",
      heroImageClass: "opacity-35 lg:opacity-50",
      heroOverlay: "bg-[linear-gradient(90deg,rgba(238,246,242,.98)_0%,rgba(238,246,242,.9)_36%,rgba(238,246,242,.42)_68%,rgba(238,246,242,.12)_100%)]",
      eyebrow: "border-emerald-900/10 bg-white/75 text-[#115e59]",
      heroTitle: "text-[#0f2522]",
      heroSlogan: "text-[#28564f]",
      heroCard: "border-white/80 bg-white/74 text-[#0f2522]",
      panel: "border-white/90 bg-white/76 text-[#0f2522]",
      mediaPanel: "border-white/80 bg-[#cfe4df]",
      softCard: "bg-[#e4f1ec] text-[#0f2522]",
      callout: "bg-[#10302b] text-white",
      sectionEyebrow: "text-[#0f766e]",
      badge: "bg-[#d9f5ee] text-[#0f766e]",
      bulletIcon: "bg-[#0f766e] text-white",
      metaCard: "border-white/80 bg-white/72",
      footer: "border-white/80 bg-white/72",
      ctaButton: "bg-[#0f2522] text-white hover:bg-[#19463f]",
      secondaryButton: "border border-[#0f2522]/10 bg-white/80 text-[#0f2522] hover:bg-white",
      navLink: "bg-white/70 text-[#0f2522] hover:bg-white",
      socialPill: "bg-white/70 text-[#0f2522] hover:bg-white",
      header: "border-white/70 bg-[#eef6f2]/88 text-[#0f2522]",
      mobileMenu: "border-white/80 bg-white/75 text-[#0f2522]",
      mobileLink: "bg-white/80 text-[#0f2522]",
    }
  }

  return {
    shell: "bg-[#0e1020] text-white shadow-[0_30px_90px_rgba(7,9,20,.36)]",
    heroSection: "bg-[#0e1020]",
    heroImageClass: "opacity-28 lg:opacity-42",
    heroOverlay: "bg-[linear-gradient(90deg,rgba(14,16,32,.96)_0%,rgba(14,16,32,.88)_36%,rgba(14,16,32,.42)_68%,rgba(14,16,32,.16)_100%)]",
    eyebrow: "border-white/12 bg-white/8 text-rose-200",
    heroTitle: "text-white",
    heroSlogan: "text-zinc-200",
    heroCard: "border-white/10 bg-white/8 text-white",
    panel: "border-white/10 bg-white/6 text-white",
    mediaPanel: "border-white/10 bg-[#1b1d31]",
    softCard: "bg-white/8 text-white",
    callout: "bg-gradient-to-br from-rose-600 to-fuchsia-700 text-white",
    sectionEyebrow: "text-rose-300",
    badge: "bg-white/10 text-rose-200",
    bulletIcon: "bg-rose-500 text-white",
    metaCard: "border-white/12 bg-white/7",
    footer: "border-white/10 bg-white/6",
    ctaButton: "bg-white text-[#111322] hover:bg-zinc-100",
    secondaryButton: "border border-white/12 bg-white/8 text-white hover:bg-white/12",
    navLink: "bg-white/8 text-zinc-100 hover:bg-white/14",
    socialPill: "bg-white/8 text-zinc-100 hover:bg-white/14",
    header: "border-white/10 bg-[#0e1020]/88 text-white",
    mobileMenu: "border-white/12 bg-white/8 text-white",
    mobileLink: "bg-white/8 text-white",
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
    maxWidth: style.maxWidth ? `${style.maxWidth}px` : undefined,
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
  }
}

function Glyph({ name, className }: { name: string; className?: string }) {
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
    whatsapp: <path d="M12 3.5a8 8 0 0 0-6.9 12.1L4 20.5l5.1-1.3A8 8 0 1 0 12 3.5Zm3.5 10c-.2-.1-1.1-.6-1.3-.6-.2-.1-.3-.1-.5.1l-.6.8c-.1.1-.2.2-.4.1-1-.5-1.8-1-2.5-2.1-.2-.3 0-.4.1-.6l.4-.5c.1-.1.1-.3 0-.4l-.5-1.3c-.2-.3-.3-.3-.4-.3h-.3c-.2 0-.4.1-.6.3-.2.2-.8.7-.8 1.7 0 1 .8 2.1.9 2.2.1.1 1.6 2.4 3.9 3.4.6.2 1 .4 1.3.5.5.1 1 .1 1.4.1.4-.1 1-.4 1.2-.8.2-.4.2-.7.1-.8 0-.1-.2-.2-.4-.3Z" />,
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

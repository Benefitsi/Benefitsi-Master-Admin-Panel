/* eslint-disable @next/next/no-img-element -- Microsite assets are admin-selected storage URLs and may use partner-specific hosts. */
"use client"

import { useEffect, useMemo, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import type {
  MenuItem,
  PartnerRewardMilestone,
  PartnerWithDeals,
} from "@/lib/admin-data"
import type { MicrositeConfig, MicrositeElementStyle } from "@/lib/microsites"
import { defaultMicrositeFaqItems } from "@/lib/microsite-seo"
import {
  partnerSocialLabel,
  partnerSocialUrl,
} from "@/lib/microsite-personalization"

type MicrositeMenuItem = MenuItem & {
  categoryName?: string | null
}

type MenuFilter = {
  id: string
  label: string
  predicate: (item: MicrositeMenuItem) => boolean
}

type SocialPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "whatsapp"
  | "website"
  | "google"
  | "linkedin"

const socialPlatforms: Array<{
  platform: SocialPlatform
  label: string
  defaultVisible: boolean
}> = [
  { platform: "instagram", label: "Instagram", defaultVisible: true },
  { platform: "facebook", label: "Facebook", defaultVisible: true },
  { platform: "tiktok", label: "TikTok", defaultVisible: true },
  { platform: "youtube", label: "YouTube", defaultVisible: false },
  { platform: "whatsapp", label: "WhatsApp", defaultVisible: false },
  { platform: "website", label: "Website", defaultVisible: false },
  { platform: "google", label: "Google", defaultVisible: false },
  { platform: "linkedin", label: "LinkedIn", defaultVisible: false },
]

const BENEFITSI_ICON_SRC = "/Benefitsi_Icon_FullColor_RGB_512.png"
const BENEFITSI_QR_PLACEHOLDER_SRC = "/benefitsi-app-qr-placeholder.png"
const PARTNER_DETAIL_SCREEN_SRC = "/partner-details-page.jpg"

function restaurantThemeForTemplate(template: MicrositeConfig["template"]) {
  if (template === "restaurant-local") {
    return {
      shell: "bg-[#fdfaf5] text-[#2f241c] shadow-[0_30px_90px_rgba(96,63,30,.12)]",
      header: "border-amber-100/80 bg-[#fff8f1]/92",
      nav: "border-amber-200/70 bg-white/78 text-[#6b4f3a] shadow-[inset_0_1px_0_rgba(255,255,255,.95),0_12px_34px_rgba(96,63,30,.08)]",
      mobileButton: "border-amber-200 bg-white text-[#6b4f3a] hover:bg-amber-50",
      mobilePanel: "border-amber-100 bg-white text-[#4b3425] shadow-[0_24px_64px_rgba(96,63,30,.16)]",
    }
  }

  if (template === "restaurant-clean") {
    return {
      shell: "bg-[#fbfbfb] text-[#111827] shadow-[0_30px_90px_rgba(15,23,42,.08)]",
      header: "border-zinc-200 bg-white/92",
      nav: "border-zinc-200 bg-zinc-50/86 text-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,.95),0_12px_34px_rgba(15,23,42,.05)]",
      mobileButton: "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
      mobilePanel: "border-zinc-200 bg-white text-zinc-800 shadow-[0_24px_64px_rgba(15,23,42,.14)]",
    }
  }

  return {
    shell: "bg-[#fffdf8] text-[#151515] shadow-[0_30px_90px_rgba(15,23,42,.10)]",
    header: "border-white/70 bg-white/88",
    nav: "border-zinc-200/70 bg-white/72 text-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,.95),0_12px_34px_rgba(15,23,42,.06)]",
    mobileButton: "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
    mobilePanel: "border-zinc-200 bg-white text-zinc-800 shadow-[0_24px_64px_rgba(15,23,42,.18)]",
  }
}

function restaurantSectionClass(
  template: MicrositeConfig["template"],
  section: "deals" | "menu" | "about",
) {
  if (template === "restaurant-local") {
    if (section === "menu") {
      return "bg-[#f6ead9]"
    }

    return "bg-[#fbf3e6]"
  }

  if (template === "restaurant-clean") {
    if (section === "menu") {
      return "bg-white"
    }

    if (section === "about") {
      return "bg-[#f4f5f7]"
    }

    return "bg-[#fbfbfb]"
  }

  return section === "menu" ? "bg-[#f8f6f1]" : "bg-[#fffdf8]"
}

export function RestaurantPremiumMicrosite({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const theme = restaurantThemeForTemplate(config.template)
  const style = {
    "--site-accent": config.branding.accent,
    "--site-secondary": config.branding.accentSecondary,
  } as CSSProperties

  return (
    <article
      style={style}
      className={`premium-microsite @container relative isolate overflow-hidden rounded-[1.6rem] ${theme.shell}`}
    >
      <PremiumMotionEffects />
      <SiteHeader partner={partner} config={config} theme={theme} />
      <HeroSection config={config} template={config.template} />
      <DealsSection partner={partner} config={config} template={config.template} />
      <MenuSection partner={partner} config={config} template={config.template} />
      <AboutContactSection partner={partner} config={config} template={config.template} />
      <FaqSection config={config} />
      <FooterSection partner={partner} config={config} />
    </article>
  )
}

function PremiumMotionEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".premium-microsite")

    if (!root) {
      return
    }

    const revealElements = Array.from(
      root.querySelectorAll<HTMLElement>(".premium-reveal"),
    )
    const parallaxElements = Array.from(
      root.querySelectorAll<HTMLElement>(".premium-parallax"),
    )

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
          }
        })
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    )

    const parallaxObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement
          const viewportHeight = window.innerHeight || 900
          const centerOffset =
            entry.boundingClientRect.top + entry.boundingClientRect.height / 2 - viewportHeight / 2
          const y = Math.max(-34, Math.min(34, centerOffset * -0.035))

          element.style.setProperty("--parallax-y", `${y.toFixed(1)}px`)
          element.classList.toggle("is-visible", entry.isIntersecting)
        })
      },
      { threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] },
    )

    const revealVisibleViewportElements = () => {
      const viewportHeight = window.innerHeight || 900

      revealElements.forEach((element) => {
        const rect = element.getBoundingClientRect()

        if (rect.top < viewportHeight * 0.94 && rect.bottom > 0) {
          element.classList.add("is-visible")
        }
      })
    }

    revealElements.forEach((element, index) => {
      element.style.setProperty("--reveal-index", String(index % 8))
      revealObserver.observe(element)
    })
    parallaxElements.forEach((element) => parallaxObserver.observe(element))

    revealVisibleViewportElements()
    window.requestAnimationFrame(revealVisibleViewportElements)

    return () => {
      revealObserver.disconnect()
      parallaxObserver.disconnect()
    }
  }, [])

  return null
}

function SiteHeader({
  partner,
  config,
  theme,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  theme: ReturnType<typeof restaurantThemeForTemplate>
}) {
  const navStyle = config.elementStyles["navigation.group"] ?? {}
  const [menuOpen, setMenuOpen] = useState(false)
  const navLinks = config.navigation.links

  return (
    <header
      {...editable("navigation.group", "group", "Top-Navigation")}
      className={`sticky top-0 z-40 flex items-center border-b px-4 py-2.5 shadow-[0_18px_55px_-34px_rgba(15,23,42,.55)] backdrop-blur-2xl @min-[640px]:px-6 @min-[1024px]:px-8 ${theme.header}`}
      style={{
        minHeight: navStyle.height ? `${navStyle.height}px` : undefined,
        ...spacingStyleFor(config, "navigation.group"),
      }}
    >
      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-[auto_1fr] items-center gap-4 @min-[640px]:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <BrandMark
            src={config.branding.logoUrl || partner.logo_url}
            editableId="branding.logo"
            style={imageStyleFor(config, "branding.logo")}
            size="nav"
          />
          <div className="hidden @min-[640px]:block">
            <p
              {...editable("branding.partnerName", "text", "Partnername")}
              className="max-w-[24ch] truncate text-base font-extrabold tracking-[-0.035em] @min-[1024px]:text-lg"
              style={textStyleFor(config, "branding.partnerName")}
            >
              {textValue(config, "branding.partnerName", partner.name || config.hero.headline)}
            </p>
          </div>
        </div>
        <nav
          className={`hidden min-w-0 items-center justify-end gap-0.5 rounded-full border px-1 py-1 text-[12px] font-bold backdrop-blur-xl @min-[640px]:flex ${theme.nav}`}
          style={navigationTabsStyleFor(config)}
        >
          {navLinks.map((link) => (
            <NavigationLink key={link.anchor} link={link} config={config} />
          ))}
        </nav>
        <div className="flex justify-end @min-[640px]:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className={`premium-button inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black shadow-sm transition ${theme.mobileButton}`}
            aria-expanded={menuOpen}
            aria-controls="microsite-mobile-navigation"
          >
            Menu
            <span className="grid gap-1">
              <span className="block h-0.5 w-4 rounded bg-current" />
              <span className="block h-0.5 w-4 rounded bg-current" />
              <span className="block h-0.5 w-4 rounded bg-current" />
            </span>
          </button>
        </div>
        {menuOpen ? (
          <nav
            id="microsite-mobile-navigation"
            className={`absolute right-0 top-[calc(100%+.65rem)] z-50 grid w-[min(88vw,330px)] gap-1 rounded-2xl border p-2 text-sm font-bold @min-[640px]:hidden ${theme.mobilePanel}`}
          >
            {navLinks.map((link) => (
              <NavigationLink
                key={link.anchor}
                link={link}
                config={config}
                compact
                onNavigate={() => setMenuOpen(false)}
              />
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  )
}

function NavigationLink({
  link,
  config,
  compact,
  onNavigate,
}: {
  link: { label: string; anchor: string }
  config: MicrositeConfig
  compact?: boolean
  onNavigate?: () => void
}) {
  return (
    <a
      {...editable(`navigation.${link.anchor}`, "text", `Navigation ${link.label}`)}
      href={`#${link.anchor}`}
      onClick={onNavigate}
      className={
        compact
          ? "rounded-xl px-3 py-2.5 transition hover:bg-zinc-50 hover:text-[var(--site-accent)]"
          : "premium-nav-link whitespace-nowrap rounded-full px-2.5 py-2 leading-none transition duration-300 hover:-translate-y-px hover:bg-white hover:text-[var(--site-accent)] hover:shadow-sm active:translate-y-0"
      }
      style={textStyleFor(config, `navigation.${link.anchor}`)}
    >
      {textValue(config, `navigation.${link.anchor}`, link.label)}
    </a>
  )
}

function HeroSection({
  config,
  template,
}: {
  config: MicrositeConfig
  template: MicrositeConfig["template"]
}) {
  if (template === "restaurant-local") {
    return <LocalRestaurantHero config={config} />
  }

  if (template === "restaurant-clean") {
    return <CleanFoodHero config={config} />
  }

  return (
    <section className="relative min-h-[690px] overflow-hidden bg-[#fffdf8] @min-[1024px]:min-h-[760px]">
      <div
        aria-hidden="true"
        className="premium-parallax absolute bottom-11 right-0 top-0 w-full bg-cover bg-center opacity-95 @min-[640px]:w-[66%]"
        style={{
          backgroundImage: `url("${config.hero.backgroundImageUrl}")`,
          ...imageStyleFor(config, "hero.backgroundImageUrl"),
        }}
      />
      <span
        {...editable("hero.backgroundImageUrl", "image", "Startbild")}
        aria-hidden="true"
        className="absolute bottom-11 right-0 top-0 z-[20] min-w-[104px] w-[42%]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,253,248,.76)_0%,#fffdf8_46%,#fffdf8_100%)] @min-[640px]:bg-[linear-gradient(90deg,#fffdf8_0%,#fffdf8_34%,rgba(255,253,248,.96)_45%,rgba(255,253,248,.56)_60%,rgba(255,253,248,.16)_74%,transparent_90%)]"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-5 @min-[640px]:px-8 @min-[1024px]:px-10">
        <div aria-hidden="true" className="premium-ambient-orb left-[42%] top-[9%] bg-[var(--site-secondary)]" />
        <div aria-hidden="true" className="premium-ambient-orb right-[9%] top-[23%] bg-[var(--site-accent)] delay-700" />
        <div className="premium-reveal flex justify-start">
          <Badge config={config} />
        </div>

        <div className="premium-reveal relative mt-8 max-w-xl @min-[640px]:mt-10 @min-[768px]:mt-12 @min-[1024px]:mt-14">
          <h1
            {...editable("hero.headline", "text", "Startbereich Überschrift")}
            className="whitespace-pre-line text-[clamp(2.65rem,6.4vw,5.15rem)] font-black leading-[.96] tracking-[-0.075em] text-zinc-950 [text-wrap:balance]"
            style={textStyleFor(config, "hero.headline")}
          >
            {config.hero.headline}
          </h1>
          <p
            {...editable("hero.slogan", "text", "Startbereich Slogan")}
            className="mt-5 text-[clamp(1.5rem,3.2vw,2.2rem)] italic leading-tight text-[var(--site-accent)]"
            style={textStyleFor(config, "hero.slogan")}
          >
            {config.hero.slogan}
          </p>
          <div className="mt-8 space-y-4 text-[clamp(1rem,1.8vw,1.12rem)]">
            <MetaLine
              id="hero.locationText"
              iconId="hero.locationIcon"
              iconName="pin"
              text={config.hero.locationText}
              config={config}
            />
            <MetaLine
              id="hero.openingText"
              iconId="hero.openingIcon"
              iconName="status"
              text={config.hero.openingText}
              accent
              config={config}
            />
          </div>
          <div className="mt-9 flex flex-col gap-3 @min-[640px]:flex-row">
            <HeroButton id="hero.primaryButtonLabel" primary label={config.hero.primaryButtonLabel} config={config} />
            <HeroButton id="hero.secondaryButtonLabel" label={config.hero.secondaryButtonLabel} config={config} />
          </div>
        </div>

        <div className="premium-reveal premium-glass-panel mt-10 grid overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/86 shadow-[0_22px_55px_rgba(15,23,42,.10)] backdrop-blur-xl @min-[640px]:grid-cols-4">
          {config.hero.services.map((service, index) => (
            <div
              key={service.label}
              className={`flex flex-col items-center justify-center gap-2 px-3 py-5 text-center text-sm ${
                index ? "border-t border-zinc-200 @min-[640px]:border-l @min-[640px]:border-t-0" : ""
              }`}
            >
              <ServiceIcon
                id={`hero.services.${index}.icon`}
                name={service.icon}
                config={config}
              />
              <span
                {...editable(`hero.services.${index}.label`, "text", `Service ${index + 1}`)}
                style={textStyleFor(config, `hero.services.${index}.label`)}
              >
                {service.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="relative h-11 bg-white">
        <div className="pointer-events-none absolute -top-9 left-[-10%] h-14 w-[120%] rounded-[50%] border-b-[6px] border-b-transparent bg-white [border-image:linear-gradient(90deg,var(--site-secondary),#1186ee)_1]" />
      </div>
    </section>
  )
}

function DealsSection({
  partner,
  config,
  template,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  template: MicrositeConfig["template"]
}) {
  const rewardMilestones = partner.reward_milestones.filter(
    (milestone) => milestone.active !== false,
  )
  const stampCount = Math.max(
    10,
    ...rewardMilestones
      .map((milestone) => milestone.required_stamps || 0)
      .filter(Boolean),
  )
  const visibleRewardStamps = Array.from(
    new Set([5, stampCount].filter((stamp) => stamp <= stampCount)),
  )
  const stampMilestoneCards = [
    {
      id: "welcome",
      stamp: 2,
      eyebrow: "Willkommensbonus",
      titleId: "stamps.welcomeBonus.title",
      titleFallback: "Direkt 2 Stempel beim ersten Besuch.",
      textId: "stamps.welcomeBonus.text",
      textFallback: null,
      imageId: null,
      imageUrl: null,
      tone: "emerald" as const,
    },
    ...visibleRewardStamps.map((stamp) => {
      const isMainReward = stamp === stampCount
      const rewardLabel = rewardLabelForStamp(rewardMilestones, stamp, isMainReward)

      return {
        id: `reward-${stamp}`,
        stamp,
        eyebrow: `${stamp} Stempel`,
        titleId: `stamps.reward.${stamp}.label`,
        titleFallback: rewardLabel,
        textId: null,
        textFallback: null,
        imageId: `stamps.reward.${stamp}.image`,
        imageUrl: textValue(
          config,
          `stamps.reward.${stamp}.image`,
          rewardImageForStamp(partner, config, stamp, isMainReward),
        ),
        tone: "amber" as const,
      }
    }),
  ]

  return (
    <section id="deals" className={`${restaurantSectionClass(template, "deals")} px-5 pb-10 @min-[640px]:px-8 @min-[1024px]:px-10`}>
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="premium-reveal grid gap-7 pb-2 pt-9 @min-[1024px]:grid-cols-[.92fr_1.08fr] @min-[1024px]:items-center">
          <div>
            <p
              {...editable("deals.label", "text", "Deals Label")}
              className="text-xs font-bold uppercase tracking-[.09em] text-[var(--site-accent)]"
              style={textStyleFor(config, "deals.label")}
            >
              {config.deals.label}
            </p>
            <h2
              {...editable("deals.headline", "text", "Deals Überschrift")}
              className="mt-4 text-[clamp(2rem,4.8vw,3.3rem)] font-black leading-[1.04] tracking-[-0.06em]"
              style={textStyleFor(config, "deals.headline")}
            >
              {config.deals.headline}
            </h2>
            <p
              {...editable("deals.slogan", "text", "Deals Slogan")}
              className="mt-4 text-[clamp(1.3rem,2.7vw,1.9rem)] italic text-[var(--site-accent)]"
              style={textStyleFor(config, "deals.slogan")}
            >
              {config.deals.slogan}
            </p>
            <p
              {...editable("deals.description", "text", "Deals Beschreibung")}
              className="mt-4 max-w-md text-sm leading-7 text-zinc-600"
              style={textStyleFor(config, "deals.description")}
            >
              {config.deals.description}
            </p>
            <div className="mt-6 grid gap-3 @min-[640px]:grid-cols-2">
              <SmallBenefit
                iconId="deals.benefit.0.icon"
                iconFallback="gift"
                titleId="deals.benefit.0.title"
                textId="deals.benefit.0.text"
                title={textValue(config, "deals.benefit.0.title", "Exklusive Partner Deals")}
                text={textValue(config, "deals.benefit.0.text", "Nur für Benefitsi Mitglieder")}
                config={config}
              />
              <SmallBenefit
                iconId="deals.benefit.1.icon"
                iconFallback="spark"
                titleId="deals.benefit.1.title"
                textId="deals.benefit.1.text"
                title={textValue(config, "deals.benefit.1.title", "Einfach & automatisch")}
                text={textValue(config, "deals.benefit.1.text", "Vorteile nutzen & sparen")}
                config={config}
              />
            </div>
          </div>
          <figure className="premium-card relative overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(135deg,#eff8ff,#fff7ed)] shadow-[0_28px_70px_rgba(15,23,42,.10)]">
            <img
              {...editable("deals.illustrationUrl", "image", "Deals Intro Bild")}
              src={config.deals.illustrationUrl}
              alt=""
              className="premium-parallax h-[260px] w-full object-cover @min-[640px]:h-[350px]"
              style={imageStyleFor(config, "deals.illustrationUrl")}
            />
            <span className="absolute right-4 top-4 z-30 grid min-h-24 min-w-24 place-items-center rounded-full border-2 border-[var(--site-accent)] bg-white px-4 py-4 text-center shadow-lg @min-[640px]:right-5 @min-[640px]:top-5">
              <span className="text-[10px] font-black uppercase leading-4 !text-[var(--site-accent)]">
                Nur in der<br />App erhältlich
              </span>
            </span>
          </figure>
        </div>

        <div className="premium-reveal premium-topdeal relative overflow-hidden rounded-[1.6rem] bg-[#121212] text-white shadow-[0_30px_80px_rgba(15,23,42,.22)]">
          <img
            src={config.deals.topDealImageUrl}
            alt=""
            className="premium-parallax absolute inset-y-0 right-0 h-full w-full object-cover object-center @min-[640px]:w-[68%]"
            style={imageStyleFor(config, "deals.topDealImageUrl")}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#121212_0%,#121212_36%,rgba(18,18,18,.93)_43%,rgba(18,18,18,.16)_73%)]" />
          <span
            {...editable("deals.topDealImageUrl", "image", "Top-Deal Bild")}
            aria-hidden="true"
            className="absolute inset-y-0 right-0 z-[20] min-w-[140px] w-[58%]"
          />
          <div className="relative z-[3] p-5 @min-[640px]:p-7 @min-[1024px]:min-h-[310px] @min-[1024px]:p-8">
            <p
              {...editable("deals.topDealLabel", "text", "Top-Deal Label")}
              className="inline-flex rounded-full border border-[var(--site-accent)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--site-accent)]"
              style={textStyleFor(config, "deals.topDealLabel")}
            >
              {config.deals.topDealLabel}
            </p>
            <h3
              {...editable("deals.topDealHeadline", "text", "Top Deal Überschrift")}
              className="mt-4 max-w-md text-[clamp(2.2rem,5vw,3.5rem)] font-black leading-none tracking-[-0.06em]"
              style={textStyleFor(config, "deals.topDealHeadline")}
            >
              {config.deals.topDealHeadline}
            </h3>
            <p
              {...editable("deals.topDealDescription", "text", "Top-Deal Beschreibung")}
              className="mt-3 text-sm text-zinc-100"
              style={textStyleFor(config, "deals.topDealDescription")}
            >
              {config.deals.topDealDescription}
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {config.deals.topDealBullets.map((bullet, index) => (
                <li key={`${bullet}-${index}`} className="flex items-center gap-2">
                  <ThemeIcon
                    id={`deals.topDealBullets.${index}.icon`}
                    name="check"
                    config={config}
                    label={`Top-Deal Punkt ${index + 1} Icon`}
                    className="grid size-4 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-white"
                    iconClassName="leading-none"
                  />
                  <span
                    {...editable(`deals.topDealBullets.${index}`, "text", `Top-Deal Punkt ${index + 1}`)}
                    style={textStyleFor(config, `deals.topDealBullets.${index}`)}
                  >
                    {bullet}
                  </span>
                </li>
              ))}
            </ul>
            <button
              {...editable("deals.topDealButtonLabel", "text", "Top-Deal Button")}
              className="mt-6 rounded-lg bg-[var(--site-accent)] px-5 py-3 text-sm font-semibold text-white"
              style={textStyleFor(config, "deals.topDealButtonLabel")}
            >
              {config.deals.topDealButtonLabel}
            </button>
          </div>
        </div>

        <div id="stempelkarte" className="premium-reveal rounded-[1.6rem] border border-white/80 bg-white/94 p-5 shadow-[0_24px_64px_rgba(15,23,42,.07)] @min-[640px]:p-7">
          <div className="grid gap-8 @min-[1024px]:grid-cols-[250px_1fr]">
            <div>
              <p
                {...editable("stamps.label", "text", "Stempelkarte Label")}
                className="text-xs font-bold uppercase text-[var(--site-accent)]"
                style={textStyleFor(config, "stamps.label")}
              >
                {config.stamps.label}
              </p>
              <h3
                {...editable("stamps.headline", "text", "Stempelkarte Überschrift")}
                className="mt-3 text-2xl font-bold leading-tight tracking-[-0.04em]"
                style={textStyleFor(config, "stamps.headline")}
              >
                {config.stamps.headline}
              </h3>
              <p
                {...editable("stamps.slogan", "text", "Stempelkarte Slogan")}
                className="mt-3 italic text-[var(--site-accent)]"
                style={textStyleFor(config, "stamps.slogan")}
              >
                {config.stamps.slogan}
              </p>
            </div>
            <div>
              <div className="relative pt-1">
                <div className="absolute left-5 right-5 top-6 hidden h-px bg-[linear-gradient(90deg,rgba(16,185,129,.38),rgba(245,158,11,.42),rgba(245,158,11,.2))] @min-[640px]:block" />
                <div
                  className="relative z-[1] grid grid-cols-5 gap-x-2 gap-y-4 @min-[640px]:grid-cols-[repeat(var(--stamp-count),minmax(42px,1fr))]"
                  style={{ "--stamp-count": stampCount } as CSSProperties}
                >
                  {Array.from({ length: stampCount }, (_, index) => {
                    const number = index + 1
                    const highlighted = visibleRewardStamps.includes(number)
                    const welcomeStamped = number <= 2

                    return (
                      <div key={number} className="flex flex-col items-center">
                        <span
                          className={`relative grid size-10 place-items-center rounded-full border bg-white text-sm font-semibold transition ${
                            highlighted
                              ? "size-11 border-2 border-[var(--site-accent)] bg-white text-[var(--site-accent)] shadow-[0_12px_24px_rgba(245,158,11,.18)] ring-4 ring-amber-50"
                              : welcomeStamped
                                ? "-rotate-[5deg] border-2 border-emerald-500 bg-emerald-50 text-emerald-700 shadow-[0_10px_18px_rgba(16,185,129,.14),inset_0_0_0_4px_rgba(16,185,129,.10)]"
                              : "border-zinc-200 text-zinc-600"
                          }`}
                        >
                          {welcomeStamped ? (
                            <span className="absolute inset-[5px] rounded-full border border-dashed border-emerald-500/70" />
                          ) : null}
                          <span
                            {...editable(`stamps.number.${number}`, "text", `Stempel ${number}`)}
                            className="relative z-[1]"
                            style={textStyleFor(config, `stamps.number.${number}`)}
                          >
                            {textValue(config, `stamps.number.${number}`, String(number))}
                          </span>
                          {welcomeStamped ? (
                            <ThemeIcon
                              id={`stamps.number.${number}.icon`}
                              name="check"
                              config={config}
                              label={`Stempel ${number} Icon`}
                              className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-emerald-500 text-[10px] font-black text-white ring-2 ring-white"
                              iconClassName="leading-none"
                            />
                          ) : null}
                          {highlighted ? (
                            <ThemeIcon
                              id={`stamps.reward.${number}.icon`}
                              name="gift"
                              config={config}
                              label={`${number} Stempel Geschenk-Icon`}
                              className="absolute -bottom-2.5 -right-2.5 grid size-7 place-items-center rounded-full bg-[var(--site-accent)] text-white shadow-[0_10px_18px_rgba(120,72,0,.22)] ring-2 ring-white"
                              iconClassName="text-sm leading-none"
                            />
                          ) : null}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div
                className="mt-7 grid gap-3 @min-[768px]:grid-cols-3 @min-[1024px]:grid-cols-[repeat(var(--stamp-count),minmax(0,1fr))]"
                style={{ "--stamp-count": stampCount } as CSSProperties}
              >
                {stampMilestoneCards.map((card) => (
                  <div
                    key={card.id}
                    className={`relative flex min-h-[104px] items-center gap-3 rounded-[1rem] border bg-white px-3 py-3 shadow-[0_14px_28px_rgba(120,72,0,.07)] before:absolute before:-top-2 before:left-[var(--reward-arrow)] before:size-4 before:-translate-x-1/2 before:rotate-45 before:border-l before:border-t before:bg-white @min-[1024px]:col-[var(--reward-col)] ${
                      card.tone === "emerald"
                        ? "border-emerald-200 before:border-emerald-200"
                        : "border-amber-200 before:border-amber-200"
                    }`}
                    style={{
                      "--reward-col": rewardGridColumn(card.stamp, stampCount),
                      "--reward-arrow": rewardArrowPosition(card.stamp, stampCount),
                    } as CSSProperties}
                  >
                    {card.imageUrl && card.imageId ? (
                      <img
                        {...editable(card.imageId, "image", `${card.eyebrow} Bild`)}
                        src={card.imageUrl}
                        alt=""
                        className="size-12 shrink-0 rounded-xl object-cover shadow-sm"
                        style={imageStyleFor(config, card.imageId)}
                      />
                    ) : (
                      <ThemeIcon
                        id="stamps.welcomeBonus.icon"
                        name="check"
                        config={config}
                        label="Willkommensbonus Icon"
                        className="grid size-12 shrink-0 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm"
                        iconClassName="text-xl leading-none"
                      />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-extrabold ${
                          card.tone === "emerald" ? "text-emerald-600" : "text-[var(--site-accent)]"
                        }`}
                      >
                        {card.eyebrow}
                      </p>
                      <p
                        {...editable(card.titleId, "text", card.eyebrow)}
                        className={`mt-1 font-black leading-tight tracking-[-0.035em] text-zinc-950 ${
                          card.tone === "emerald" ? "text-[13px]" : "text-[15px]"
                        }`}
                        style={textStyleFor(config, card.titleId)}
                      >
                        {textValue(config, card.titleId, card.titleFallback)}
                      </p>
                      {card.textId && card.textFallback ? (
                        <p
                          {...editable(card.textId, "text", "Willkommensbonus Text")}
                          className="mt-1 text-[11px] leading-4 text-zinc-500"
                          style={textStyleFor(config, card.textId)}
                        >
                          {textValue(config, card.textId, card.textFallback)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <p
                {...editable("stamps.description", "text", "Stempelkarte Hinweis")}
                className="mt-7 text-xs text-zinc-500"
                style={textStyleFor(config, "stamps.description")}
              >
                {textValue(
                  config,
                  "stamps.description",
                  "Belohnungen und benötigte Stempel werden direkt aus den Partnerdaten übernommen.",
                )}
              </p>
            </div>
          </div>
        </div>

        <AppDownloadBanner partner={partner} config={config} />
      </div>
    </section>
  )
}

function AppDownloadBanner({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const appUrl = textValue(
    config,
    "content.appDownloadUrl",
    appDownloadUrlForPartner(partner),
  )
  const qrUrl = textValue(config, "content.appQrCodeUrl", BENEFITSI_QR_PLACEHOLDER_SRC)

  return (
    <div
      id="app"
      className="premium-reveal relative overflow-hidden rounded-[1.7rem] border border-white/80 bg-white/94 px-5 py-6 shadow-[0_26px_70px_rgba(15,23,42,.09)] @min-[760px]:px-7 @min-[1024px]:px-8"
    >
      <div className="pointer-events-none absolute -bottom-11 left-[-8%] h-16 w-[116%] rounded-[50%] border-b-[6px] border-b-transparent bg-white [border-image:linear-gradient(90deg,var(--site-secondary),#1186ee)_1]" />

      <div className="relative grid gap-7 @min-[900px]:grid-cols-[minmax(210px,.72fr)_minmax(0,1.22fr)_minmax(260px,.78fr)] @min-[900px]:items-center">
        <div className="self-end">
          <AppPhoneMockup partner={partner} config={config} />
        </div>

        <div className="min-w-0 max-w-xl">
          <div className="flex items-center gap-3">
            <span
              {...editable("content.appKicker.icon", "image", "App-Banner Icon")}
              className="grid size-11 place-items-center rounded-2xl bg-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_10px_22px_rgba(2,132,199,.12)]"
            >
              <img
                src={BENEFITSI_ICON_SRC}
                alt=""
                className="size-7 object-contain"
                style={imageStyleFor(config, "content.appKicker.icon")}
              />
            </span>
            <p
              {...editable("content.appKicker", "text", "App-Banner Label")}
              className="text-sm font-semibold text-zinc-700"
              style={textStyleFor(config, "content.appKicker")}
            >
              {textValue(config, "content.appKicker", "In der Benefitsi App")}
            </p>
          </div>

          <h2
            {...editable("content.appHeadline", "text", "App-Banner Überschrift")}
            className="mt-4 text-[clamp(1.7rem,3vw,2.55rem)] font-black leading-tight tracking-[-0.055em] text-zinc-950"
            style={textStyleFor(config, "content.appHeadline")}
          >
            {textValue(config, "content.appHeadline", config.content.appHeadline)}
          </h2>
          <p
            {...editable("content.appText", "text", "App-Banner Text")}
            className="mt-3 max-w-[36rem] text-sm leading-7 text-zinc-600 @min-[760px]:text-base"
            style={textStyleFor(config, "content.appText")}
          >
            {textValue(
              config,
              "content.appText",
              config.content.appText,
            )}
          </p>

          <ul className="mt-4 grid gap-2 text-sm font-medium text-zinc-700">
            {[
              ["content.appBenefit.0", "Stempelstand jederzeit einsehbar"],
              ["content.appBenefit.1", "Belohnungen automatisch freischalten"],
              ["content.appBenefit.2", "Einfach, schnell & digital"],
            ].map(([id, fallback]) => (
              <li key={id} className="flex items-center gap-2">
                <ThemeIcon
                  id={`${id}.icon`}
                  name="check"
                  config={config}
                  label="App Vorteil Icon"
                  className="grid size-5 place-items-center rounded-full bg-emerald-500 text-white"
                  iconClassName="text-xs leading-none"
                />
                <span
                  {...editable(id, "text", "App Vorteil")}
                  style={textStyleFor(config, id)}
                >
                  {textValue(config, id, fallback)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap gap-3">
            <StoreBadge store="app-store" href={appUrl} />
            <StoreBadge store="google-play" href={appUrl} />
          </div>

          <div className="mt-5 grid gap-2 @min-[520px]:grid-cols-3">
            <AppVisualPill
              id="content.appVisual.0"
              icon="benefitsi"
              label={textValue(config, "content.appVisual.0", "Benefitsi App")}
              config={config}
            />
            <AppVisualPill
              id="content.appVisual.1"
              icon="plate"
              label={textValue(config, "content.appVisual.1", "Speisekarte")}
              config={config}
            />
            <AppVisualPill
              id="content.appVisual.2"
              icon="qr"
              label={textValue(config, "content.appVisual.2", "Scan & Vorteil")}
              config={config}
            />
          </div>
        </div>

        <div className="grid gap-4 border-zinc-200 @min-[900px]:border-l @min-[900px]:pl-7">
          <div className="grid justify-items-start gap-3 @min-[520px]:grid-cols-[auto_1fr] @min-[520px]:items-center @min-[900px]:grid-cols-1 @min-[900px]:justify-items-center">
            <a
              href={appUrl}
              className="aspect-square w-48 max-w-full rounded-[1.4rem] border border-zinc-200 bg-white p-3 shadow-[0_16px_36px_rgba(15,23,42,.08)] transition hover:-translate-y-0.5 @min-[1024px]:w-56"
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
            <div className="@min-[900px]:text-center">
              <p
                {...editable("content.appQrLabel", "text", "QR-Code Hinweis")}
                className="text-2xl italic leading-tight text-[var(--site-accent)] [font-family:'Brush_Script_MT','Segoe_Print',cursive]"
                style={textStyleFor(config, "content.appQrLabel")}
              >
                {textValue(config, "content.appQrLabel", "App öffnen & einchecken")}
              </p>
              <p
                {...editable("content.appQrText", "text", "QR-Code Text")}
                className="mt-2 text-xs font-semibold uppercase tracking-[.08em] text-zinc-500"
                style={textStyleFor(config, "content.appQrText")}
              >
                {textValue(config, "content.appQrText", "QR-Code scannen")}
              </p>
            </div>
          </div>

          <a
            href={appUrl}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-950 px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-zinc-800"
          >
            <span
              {...editable("content.appButtonLabel", "text", "App-Schaltfläche")}
              style={textStyleFor(config, "content.appButtonLabel")}
            >
              {textValue(config, "content.appButtonLabel", "App öffnen")}
            </span>
          </a>
        </div>
        </div>
      </div>
  )
}

function LocalRestaurantHero({ config }: { config: MicrositeConfig }) {
  const heroImage = config.hero.backgroundImageUrl || "/upload-image.jpg"

  return (
    <section className="relative overflow-hidden bg-[#24170f] px-5 py-10 text-[#fff7ed] @min-[640px]:px-8 @min-[1024px]:px-10 @min-[1024px]:py-14">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(245,158,11,.24),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,.16),transparent_28%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-7 @min-[960px]:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] @min-[960px]:items-center">
        <div className="premium-reveal min-w-0 rounded-[2rem] border border-white/10 bg-white/[.06] p-5 shadow-[0_28px_70px_rgba(0,0,0,.2)] @min-[760px]:p-7">
          <p
            {...editable("hero.badgeText", "text", "Badge-Text")}
            className="inline-flex max-w-full rounded-full bg-[#fbbf24] px-4 py-2 text-xs font-black uppercase tracking-[.08em] text-[#24170f] shadow-sm"
            style={textStyleFor(config, "hero.badgeText")}
          >
            {config.hero.badgeText}
          </p>
          <h1
            {...editable("hero.headline", "text", "Startbereich Überschrift")}
            className="mt-5 max-w-[14ch] text-[clamp(2.35rem,7vw,5rem)] font-black leading-[1.02] text-white [text-wrap:balance]"
            style={textStyleFor(config, "hero.headline")}
          >
            {config.hero.headline}
          </h1>
          <p
            {...editable("hero.slogan", "text", "Startbereich Slogan")}
            className="mt-4 max-w-xl text-[clamp(1.1rem,2.4vw,1.6rem)] leading-tight text-[#fed7aa]"
            style={textStyleFor(config, "hero.slogan")}
          >
            {config.hero.slogan}
          </p>
          <div className="mt-7 grid gap-3 @min-[640px]:grid-cols-2">
            <MetaLine id="hero.locationText" iconId="hero.locationIcon" iconName="pin" text={config.hero.locationText} config={config} />
            <MetaLine id="hero.openingText" iconId="hero.openingIcon" iconName="clock" text={config.hero.openingText} accent config={config} />
          </div>
          <div className="mt-8 flex flex-col gap-3 @min-[640px]:flex-row">
            <HeroButton id="hero.primaryButtonLabel" primary label={config.hero.primaryButtonLabel} config={config} />
            <HeroButton id="hero.secondaryButtonLabel" label={config.hero.secondaryButtonLabel} config={config} />
          </div>
        </div>

        <div className="premium-reveal relative min-h-[380px] @min-[640px]:min-h-[500px]">
          <div className="absolute -inset-2 rotate-[-1.5deg] rounded-[2rem] bg-[#fbbf24]" />
          <img
            {...editable("hero.backgroundImageUrl", "image", "Startbild")}
            src={heroImage}
            alt=""
            className="premium-parallax relative h-[380px] w-full rounded-[2rem] object-cover shadow-[0_28px_70px_rgba(0,0,0,.28)] @min-[640px]:h-[500px]"
            style={imageStyleFor(config, "hero.backgroundImageUrl")}
          />
          <div className="absolute bottom-5 left-5 right-5 rounded-[1.3rem] bg-[#1f140d]/90 p-4 text-white shadow-[0_18px_46px_rgba(0,0,0,.24)] ring-1 ring-white/10 backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-[.12em] text-[#fbbf24]">Lokal empfohlen</p>
            <div className="mt-3 grid grid-cols-1 gap-2 @min-[520px]:grid-cols-2">
              {config.hero.services.slice(0, 2).map((service, index) => (
                <div key={service.label} className="flex min-w-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white">
                  <ServiceIcon id={`hero.services.${index}.icon`} name={service.icon} config={config} className="grid size-8 shrink-0 place-items-center rounded-full bg-[#fbbf24] text-[#24170f]" />
                  <span className="min-w-0 break-words">{service.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CleanFoodHero({ config }: { config: MicrositeConfig }) {
  return (
    <section className="relative overflow-hidden bg-[#fbfbfb] px-5 py-10 @min-[640px]:px-8 @min-[1024px]:px-10 @min-[1024px]:py-14">
      <div className="mx-auto grid max-w-6xl gap-8 @min-[920px]:grid-cols-[minmax(0,1fr)_420px] @min-[920px]:items-center">
        <div className="premium-reveal min-w-0">
          <p
            {...editable("hero.badgeText", "text", "Badge-Text")}
            className="inline-flex max-w-full rounded-full bg-zinc-950 px-4 py-2 text-xs font-black uppercase tracking-[.08em] text-white"
            style={textStyleFor(config, "hero.badgeText")}
          >
            {config.hero.badgeText}
          </p>
          <h1
            {...editable("hero.headline", "text", "Startbereich Überschrift")}
            className="mt-5 max-w-[13ch] text-[clamp(2.5rem,7vw,5.25rem)] font-black leading-[.98] text-zinc-950 [text-wrap:balance]"
            style={textStyleFor(config, "hero.headline")}
          >
            {config.hero.headline}
          </h1>
          <p
            {...editable("hero.slogan", "text", "Startbereich Slogan")}
            className="mt-5 max-w-2xl text-[clamp(1.05rem,2vw,1.35rem)] leading-8 text-zinc-600"
            style={textStyleFor(config, "hero.slogan")}
          >
            {config.hero.slogan}
          </p>
          <div className="mt-8 flex flex-col gap-3 @min-[640px]:flex-row">
            <HeroButton id="hero.primaryButtonLabel" primary label={config.hero.primaryButtonLabel} config={config} />
            <HeroButton id="hero.secondaryButtonLabel" label={config.hero.secondaryButtonLabel} config={config} />
          </div>
          <div className="mt-8 grid gap-3 @min-[640px]:grid-cols-3">
            {config.hero.services.slice(0, 3).map((service, index) => (
              <div key={service.label} className="rounded-2xl bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,.06)] ring-1 ring-zinc-100">
                <ServiceIcon id={`hero.services.${index}.icon`} name={service.icon} config={config} className="grid size-9 place-items-center rounded-xl bg-zinc-950 text-white" />
                <p className="mt-3 text-sm font-black text-zinc-950">{service.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="premium-reveal">
          <div className="overflow-hidden rounded-[2rem] bg-white p-3 shadow-[0_28px_80px_rgba(15,23,42,.12)] ring-1 ring-zinc-100">
            <img
              {...editable("hero.backgroundImageUrl", "image", "Startbild")}
              src={config.hero.backgroundImageUrl}
              alt=""
              className="premium-parallax h-[390px] w-full rounded-[1.5rem] object-cover"
              style={imageStyleFor(config, "hero.backgroundImageUrl")}
            />
            <div className="grid grid-cols-2 gap-3 p-3">
              <MetaLine id="hero.locationText" iconId="hero.locationIcon" iconName="pin" text={config.hero.locationText} config={config} />
              <MetaLine id="hero.openingText" iconId="hero.openingIcon" iconName="status" text={config.hero.openingText} accent config={config} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AppPhoneMockup({
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const screenshotUrl = textValue(
    config,
    "content.appPhoneScreenshotUrl",
    PARTNER_DETAIL_SCREEN_SRC,
  )

  return (
    <div className="relative isolate mx-auto w-[min(72vw,250px)] rounded-[2.85rem] bg-[#111214] p-[9px] shadow-[0_34px_70px_rgba(15,23,42,.32),inset_0_0_0_1px_rgba(255,255,255,.08)] @min-[1024px]:w-[270px]">
      <div className="absolute -left-1 top-24 h-14 w-1 rounded-l bg-zinc-800" />
      <div className="absolute -left-1 top-44 h-10 w-1 rounded-l bg-zinc-800" />
      <div className="absolute -right-1 top-32 h-20 w-1 rounded-r bg-zinc-800" />
      <div className="pointer-events-none absolute left-1/2 top-[10px] z-20 h-6 w-24 -translate-x-1/2 rounded-b-2xl bg-[#111214]" />
      <div
        className="relative isolate aspect-[720/1600] overflow-hidden rounded-[2.25rem] bg-[#111214]"
        style={{ clipPath: "inset(0 round 2.25rem)" }}
      >
        <img
          {...editable("content.appPhoneScreenshotUrl", "image", "App Screenshot im iPhone")}
          src={screenshotUrl}
          alt=""
          className="h-full w-full scale-[1.012] object-cover"
          style={imageStyleFor(config, "content.appPhoneScreenshotUrl")}
        />
        <div className="pointer-events-none absolute inset-0 rounded-[2.25rem] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.2),inset_0_-24px_50px_rgba(15,23,42,.12)]" />
      </div>
    </div>
  )
}

function AppVisualPill({
  id,
  icon,
  label,
  config,
}: {
  id: string
  icon: string
  label: string
  config: MicrositeConfig
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-[var(--site-accent)] shadow-sm ring-1 ring-zinc-100">
        {icon === "benefitsi" ? (
          <img src={BENEFITSI_ICON_SRC} alt="" className="size-5 object-contain" />
        ) : (
          <ThemeGlyph name={icon} className="size-4" />
        )}
      </span>
      <span
        {...editable(id, "text", "App Visual")}
        className="min-w-0 whitespace-normal break-words text-xs font-black leading-tight text-zinc-700"
        style={textStyleFor(config, id)}
      >
        {label}
      </span>
    </div>
  )
}

function StoreBadge({
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
      className="inline-flex min-w-[190px] items-center gap-3 rounded-[0.9rem] bg-black px-4 py-3 text-white shadow-[0_14px_30px_rgba(15,23,42,.18)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-zinc-900"
      aria-label={isAppStore ? "Laden im App Store" : "Jetzt bei Google Play"}
    >
      {isAppStore ? <AppleGlyph /> : <PlayGlyph />}
      <span>
        <span className="block text-[10px] font-semibold uppercase leading-none text-zinc-300">
          {isAppStore ? "Laden im" : "Jetzt bei"}
        </span>
        <span className="block text-[1.05rem] font-black leading-tight">
          {isAppStore ? "App Store" : "Google Play"}
        </span>
      </span>
    </a>
  )
}

function BenefitsiLockup({
  compact = false,
  className = "",
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 font-black text-zinc-950 ${className}`}>
      <img
        src={BENEFITSI_ICON_SRC}
        alt=""
        className={`${compact ? "size-5" : "size-8"} rounded-[0.55rem] object-contain`}
      />
      <span>benefitsi</span>
    </span>
  )
}

function BenefitsiMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M7.2 3.4v10.2a5.2 5.2 0 1 0 5.2-5.2H9.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M12.5 8.4a5.2 5.2 0 1 1 0 10.4"
        fill="none"
        stroke="#0ea5e9"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  )
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8" fill="currentColor">
      <path d="M16.46 12.42c-.03-3.03 2.48-4.49 2.6-4.56-1.42-2.07-3.62-2.35-4.39-2.39-1.85-.19-3.64 1.1-4.58 1.1-.96 0-2.41-1.07-3.98-1.04-2.03.03-3.92 1.2-4.96 3.03-2.14 3.7-.55 9.14 1.5 12.13 1.03 1.47 2.23 3.11 3.79 3.05 1.53-.06 2.1-.98 3.95-.98 1.83 0 2.37.98 3.97.95 1.64-.03 2.67-1.48 3.66-2.97 1.19-1.68 1.66-3.34 1.68-3.42-.04-.01-3.2-1.23-3.24-4.9Z" />
      <path d="M13.46 3.5c.83-1.04 1.39-2.45 1.24-3.87-1.2.05-2.7.83-3.56 1.84-.76.88-1.44 2.35-1.26 3.72 1.35.1 2.72-.68 3.58-1.69Z" />
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-8">
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

function aboutHeadlineFor(config: MicrositeConfig) {
  const existing = config.content.aboutHeadline.trim()

  if (existing && !/auf einen blick/i.test(existing)) {
    return existing
  }

  const place =
    config.hero.locationText
      .replace(/^.*?\bin\b\s+/i, "")
      .replace(/\.$/, "")
      .trim() || "die Region"

  return `Frisch gemacht. Mit Herz. Für ${place}.`
}

function contactHeadlineFor(config: MicrositeConfig) {
  const existing = config.content.contactHeadline.trim()

  if (existing && existing !== "Bereit für deinen nächsten Besuch?") {
    return existing
  }

  return "Wir sind für dich da."
}

function MenuSection({
  partner,
  config,
  template,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  template: MicrositeConfig["template"]
}) {
  const items = useMemo(() => menuItemsForPartner(partner), [partner])
  const filters = useMemo(() => menuFiltersForItems(items), [items])
  const [activeFilterId, setActiveFilterId] = useState("all")
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuQuery, setMenuQuery] = useState("")
  const activeFilter =
    filters.find((filter) => filter.id === activeFilterId) ?? filters[0]
  const filteredItems = activeFilter
    ? items.filter(activeFilter.predicate)
    : items
  const normalizedMenuQuery = menuQuery.trim().toLowerCase()
  const visibleItems = normalizedMenuQuery
    ? filteredItems.filter((item) =>
        [item.name, item.description, item.categoryName, item.price]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedMenuQuery),
      )
    : filteredItems
  const previewItems = items.slice(0, 6)

  const imageLessCount = items.filter((item) => !item.image_url).length

  return (
    <section id="speisekarte" className={`${restaurantSectionClass(template, "menu")} px-5 py-12 @min-[640px]:px-8 @min-[1024px]:px-10`}>
      <div className="mx-auto max-w-6xl">
        <div className="premium-reveal flex flex-col gap-5 @min-[640px]:flex-row @min-[900px]:items-end @min-[900px]:justify-between">
          <div className="max-w-2xl">
            <p
              {...editable("content.menuLabel", "text", "Speisekarte Label")}
              className="text-xs font-bold uppercase tracking-[.09em] text-[var(--site-accent)]"
              style={textStyleFor(config, "content.menuLabel")}
            >
              {config.content.menuLabel}
            </p>
            <h2
              {...editable("content.menuHeadline", "text", "Speisekarte Überschrift")}
              className="mt-3 text-[clamp(2rem,4vw,3rem)] font-black leading-tight tracking-[-0.055em]"
              style={textStyleFor(config, "content.menuHeadline")}
            >
              {config.content.menuHeadline}
            </h2>
            <p
              {...editable("content.menuDescription", "text", "Speisekarte Beschreibung")}
              className="mt-3 text-sm leading-7 text-zinc-600"
              style={textStyleFor(config, "content.menuDescription")}
            >
              {config.content.menuDescription}
            </p>
          </div>

          {items.length && imageLessCount ? (
            <p className="max-w-xs rounded-xl bg-white px-4 py-3 text-sm font-medium text-zinc-600 shadow-sm">
              Speisen und Getränke ohne Bild erhalten automatisch einen passenden Platzhalter.
            </p>
          ) : null}
        </div>

        {items.length ? (
          <>
            <div className="mt-7 grid gap-3 @min-[768px]:grid-cols-2">
              {previewItems.map((item) => (
                <MenuCard
                  key={item.id ?? `${item.categoryName}-${item.name}-${item.price}`}
                  item={item}
                />
              ))}
            </div>

            <div className="mt-6 flex justify-center rounded-[1.2rem] border border-orange-100 bg-white p-5 shadow-sm">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="premium-button rounded-2xl bg-[var(--site-accent)] px-8 py-4 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                Komplette Speisekarte öffnen
              </button>
            </div>

            {menuOpen ? (
              <div
                className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label="Komplette Speisekarte"
              >
                <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.4rem] bg-white shadow-2xl">
                  <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 @min-[768px]:flex-row @min-[768px]:items-start @min-[768px]:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.09em] text-[var(--site-accent)]">
                        Komplette Speisekarte
                      </p>
                      <h3 className="mt-1 text-2xl font-black tracking-[-0.05em]">
                        {visibleItems.length} von {items.length} Artikeln
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMenuOpen(false)}
                      className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-xl font-bold text-zinc-700 transition hover:bg-zinc-50"
                      aria-label="Speisekarte schließen"
                    >
                      ×
                    </button>
                  </div>

                  <div className="border-b border-zinc-100 px-5 py-3">
                    <div className="flex flex-col gap-3 @min-[760px]:flex-row @min-[760px]:items-center @min-[760px]:justify-between">
                      <input
                        type="search"
                        value={menuQuery}
                        onChange={(event) => setMenuQuery(event.target.value)}
                        placeholder="Gericht, Getränk oder Kategorie suchen"
                        className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-900 outline-none transition focus:border-[var(--site-accent)] focus:bg-white @min-[760px]:max-w-sm"
                      />
                      <div className="flex gap-2 overflow-x-auto pb-1 @min-[760px]:justify-end">
                        {filters.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => setActiveFilterId(filter.id)}
                          className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                            activeFilterId === filter.id
                              ? "border-[var(--site-accent)] bg-[var(--site-accent)] text-white shadow-sm"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]"
                          }`}
                        >
                          {filter.label}
                        </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-y-auto p-5">
                    {visibleItems.length ? (
                      <div className="grid gap-3 @min-[768px]:grid-cols-2">
                        {visibleItems.map((item) => (
                          <MenuCard
                            key={item.id ?? `${item.categoryName}-${item.name}-${item.price}`}
                            item={item}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[1.2rem] border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
Für diese Suche oder diesen Filter gibt es aktuell keine Einträge.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-7 rounded-[1.2rem] border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
            Sobald im Admin eine Speisekarte gepflegt ist, erscheinen hier automatisch die beliebtesten Gerichte.
          </div>
        )}
      </div>
    </section>
  )
}
function AboutContactSection({
  partner,
  config,
  template,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  template: MicrositeConfig["template"]
}) {
  const aboutHeroImage = textValue(
    config,
    "content.aboutHeroImageUrl",
    config.deals.topDealImageUrl || config.hero.backgroundImageUrl,
  )
  const aboutIngredientImage = textValue(
    config,
    "content.aboutIngredientImageUrl",
    config.deals.illustrationUrl || config.hero.backgroundImageUrl,
  )
  const aboutLocationImage = textValue(
    config,
    "content.aboutLocationImageUrl",
    config.hero.backgroundImageUrl,
  )
  const aboutPrepImage = textValue(
    config,
    "content.aboutPrepImageUrl",
    config.hero.backgroundImageUrl,
  )

  return (
    <section className={`${restaurantSectionClass(template, "about")} px-5 py-8 @min-[640px]:px-8 @min-[1024px]:px-10`}>
      <div
        id="ueber-uns"
        className="premium-reveal relative mx-auto max-w-6xl overflow-hidden rounded-[1.85rem] border border-white/80 bg-white shadow-[0_30px_85px_rgba(15,23,42,.10)]"
      >
        <img
          {...editable("content.aboutHeroImageUrl", "image", "Über uns Hintergrundbild")}
          src={aboutHeroImage}
          alt=""
          className="premium-parallax absolute inset-y-0 right-0 hidden h-full w-[62%] object-cover @min-[900px]:block"
          style={imageStyleFor(config, "content.aboutHeroImageUrl")}
        />
        <img
          {...editable("content.aboutPrepImageUrl", "image", "Über uns Detailbild")}
          src={aboutPrepImage}
          alt=""
          className="absolute bottom-0 right-0 hidden h-[34%] w-[46%] object-cover opacity-65 blur-[.2px] @min-[900px]:block"
          style={imageStyleFor(config, "content.aboutPrepImageUrl")}
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#fff_0%,#fff_42%,rgba(255,255,255,.82)_54%,rgba(255,255,255,.18)_73%,rgba(255,255,255,0)_100%)]" />
        <div className="pointer-events-none absolute -bottom-12 left-[-12%] h-16 w-[124%] rounded-[50%] border-b-[6px] border-b-transparent bg-white [border-image:linear-gradient(90deg,var(--site-secondary),#1186ee)_1]" />

        <div className="relative grid min-h-[480px] gap-5 px-6 py-5 @min-[760px]:px-8 @min-[1024px]:grid-cols-[.54fr_.46fr] @min-[1024px]:px-9 @min-[1024px]:py-6">
          <div className="max-w-[620px]">
            <p
              {...editable("content.aboutLabel", "text", "Über uns Label")}
              className="text-sm font-black text-[var(--site-accent)] @min-[760px]:text-base"
              style={textStyleFor(config, "content.aboutLabel")}
            >
              {config.content.aboutLabel}
            </p>
            <h2
              {...editable("content.aboutHeadline", "text", "Über uns Überschrift")}
              className="mt-2.5 text-[clamp(2rem,3.2vw,2.95rem)] font-black leading-[1.04] tracking-[-0.06em] text-zinc-950"
              style={textStyleFor(config, "content.aboutHeadline")}
            >
              {textValue(config, "content.aboutHeadline", aboutHeadlineFor(config))}
            </h2>
            <p
              {...editable("content.aboutSlogan", "text", "Über uns Slogan")}
              className="mt-2.5 max-w-xl text-[clamp(1.05rem,1.75vw,1.28rem)] italic leading-tight text-[var(--site-accent)] [font-family:'Brush_Script_MT','Segoe_Print',cursive]"
              style={textStyleFor(config, "content.aboutSlogan")}
            >
              {textValue(
                config,
                "content.aboutSlogan",
                "Aus Leidenschaft für gutes Essen und unsere Heimat.",
              )}
            </p>
            <div className="mt-4 max-w-xl space-y-2.5 text-sm leading-5 text-zinc-700 @min-[760px]:text-[14px]">
              <p
                {...editable("content.aboutText", "text", "Über uns Text")}
                style={textStyleFor(config, "content.aboutText")}
              >
                {config.content.aboutText}
              </p>
              <p
                {...editable("content.aboutTextSecond", "text", "Über uns Zusatztext")}
                style={textStyleFor(config, "content.aboutTextSecond")}
              >
                {textValue(
                  config,
                  "content.aboutTextSecond",
                  "Ob in der Mittagspause, nach der Wanderung oder beim Abendessen mit Freunden – wir sind für dich da. Schnell, lecker und immer mit einem Lächeln.",
                )}
              </p>
              <p
                {...editable("content.aboutThanks", "text", "Über uns Dank")}
                className="font-black text-zinc-950"
                style={textStyleFor(config, "content.aboutThanks")}
              >
                {textValue(config, "content.aboutThanks", "Danke, Annweiler – ihr seid die Besten!")}
              </p>
            </div>

            <p
              {...editable("content.aboutSignature", "text", "Über uns Signatur")}
              className="mt-3 text-[1.35rem] italic text-zinc-950 [font-family:'Brush_Script_MT','Segoe_Print',cursive]"
              style={textStyleFor(config, "content.aboutSignature")}
            >
              {textValue(config, "content.aboutSignature", "Euer Knobi-Team")}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 @min-[640px]:grid-cols-4">
              <AboutValueCard
                id="content.aboutValue.0"
                icon="leaf"
                fallback="Täglich frisch"
                config={config}
              />
              <AboutValueCard
                id="content.aboutValue.1"
                icon="bowl"
                fallback="Hausgemachte Saucen"
                config={config}
              />
              <AboutValueCard
                id="content.aboutValue.2"
                icon="smile"
                fallback="Freundlicher Service"
                config={config}
              />
              <AboutValueCard
                id="content.aboutValue.3"
                icon="pizza"
                fallback="Döner, Pizza und Fast Food"
                config={config}
              />
            </div>
          </div>

          <div className="relative hidden min-h-[400px] @min-[1024px]:block">
            <figure className="absolute left-2 top-[155px] w-[44%] -rotate-3 rounded-[1.1rem] border-[6px] border-white bg-white shadow-[0_22px_46px_rgba(15,23,42,.20)]">
              <img
                {...editable("content.aboutIngredientImageUrl", "image", "Über uns Zutatenbild")}
                src={aboutIngredientImage}
                alt=""
                className="aspect-[4/5] w-full rounded-[.75rem] object-cover"
                style={imageStyleFor(config, "content.aboutIngredientImageUrl")}
              />
            </figure>
            <figure className="absolute right-2 top-[164px] w-[48%] rotate-2 rounded-[1.1rem] border-[6px] border-white bg-white shadow-[0_22px_46px_rgba(15,23,42,.20)]">
              <img
                {...editable("content.aboutLocationImageUrl", "image", "Über uns Ortsbild")}
                src={aboutLocationImage}
                alt=""
                className="aspect-[4/5] w-full rounded-[.75rem] object-cover"
                style={imageStyleFor(config, "content.aboutLocationImageUrl")}
              />
            </figure>
          </div>
        </div>
      </div>

      <div
        id="kontakt"
        className="premium-reveal mx-auto mt-6 max-w-6xl scroll-mt-24 overflow-hidden rounded-[1.65rem] bg-[#101010] p-3 text-white shadow-[0_30px_90px_rgba(15,23,42,.26)]"
      >
        <CompactContactSection partner={partner} config={config} />
      </div>
    </section>
  )
}

function CompactContactSection({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const address = contactAddressFor(partner, config)
  const phone = partner.phone || "Telefon im Admin ergänzen"
  const opening = textValue(
    config,
    "content.contactOpening",
    config.hero.openingText.replace("Heute geöffnet ·", "Täglich"),
  )
  const mapsQuery = mapsQueryForPartner(partner, address)
  const mapsEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapsQuery)}&output=embed`
  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`
  const phoneHref = partner.phone ? `tel:${partner.phone.replace(/[^\d+]/g, "")}` : undefined

  return (
    <div className="grid gap-4 @min-[900px]:grid-cols-[.44fr_.56fr]">
      <div className="flex min-h-[350px] flex-col justify-between rounded-[1.1rem] border border-white/10 bg-white/[.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.08)] @min-[900px]:min-h-[380px]">
        <div>
          <p
            {...editable("content.contactLabel", "text", "Kontakt Label")}
            className="text-xs font-black uppercase tracking-[.12em] text-[var(--site-accent)]"
            style={textStyleFor(config, "content.contactLabel")}
          >
            {textValue(config, "content.contactLabel", "Kontakt & Socials")}
          </p>
          <h2
            {...editable("content.contactHeadline", "text", "Kontakt Überschrift")}
            className="mt-1.5 max-w-[12ch] text-[clamp(1.75rem,3vw,2.35rem)] font-black leading-[1.02] tracking-[-0.065em]"
            style={textStyleFor(config, "content.contactHeadline")}
          >
            {textValue(config, "content.contactHeadline", contactHeadlineFor(config))}
          </h2>
          <p
            {...editable("content.contactSlogan", "text", "Kontakt Slogan")}
            className="mt-1.5 text-[1.1rem] italic leading-tight text-[var(--site-accent)] [font-family:'Brush_Script_MT','Segoe_Print',cursive]"
            style={textStyleFor(config, "content.contactSlogan")}
          >
            {textValue(config, "content.contactSlogan", "Wir freuen uns auf dich.")}
          </p>
        </div>

        <div className="mt-5 text-white">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <BrandMark
              src={config.branding.logoUrl || partner.logo_url}
              editableId="contact.logo"
              style={imageStyleFor(config, "contact.logo")}
              size="contact"
            />
            <p
              {...editable("branding.partnerName", "text", "Kontakt Partnername")}
              className="text-xl font-black leading-tight tracking-[-0.045em] text-white"
              style={textStyleFor(config, "branding.partnerName")}
            >
              {textValue(config, "branding.partnerName", partner.name || config.hero.headline)}
            </p>
          </div>

          <div className="mt-4 space-y-3 text-sm text-zinc-200">
            <ContactInfoLine id="content.contact.address" icon="pin" label="Adresse" value={address} config={config} />
            <ContactInfoLine id="content.contact.phone" icon="phone" label="Telefon" value={phone} config={config} />
            <ContactInfoLine id="content.contact.opening" icon="clock" label="Öffnungszeiten" value={opening} config={config} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 @min-[760px]:hidden">
            <a
              href={routeUrl}
              target="_blank"
              rel="noreferrer"
              className="col-span-2 rounded-xl bg-[var(--site-accent)] px-4 py-3 text-center text-sm font-black text-white shadow-[0_12px_28px_rgba(245,158,11,.28)]"
            >
              Route
            </a>
            <a
              href={phoneHref || "#kontakt"}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white"
            >
              Anrufen
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white"
            >
              Karte
            </a>
          </div>
        </div>

        <div className="mt-5 rounded-[1rem] border border-white/10 bg-white/[.045] p-3 text-zinc-300">
          <p
            {...editable("content.contactSocialText", "text", "Social-Media-Text")}
            className="text-sm font-semibold leading-snug"
            style={textStyleFor(config, "content.contactSocialText")}
          >
            {textValue(config, "content.contactSocialText", "Folge uns für Aktionen & Neuigkeiten.")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {socialPlatforms
              .filter((item) =>
                socialVisible(config, partner, item.platform, item.defaultVisible),
              )
              .map((item) => (
                <SocialBadge
                  key={item.platform}
                  platform={item.platform}
                  label={item.label}
                  partner={partner}
                  config={config}
                />
              ))}
          </div>
        </div>
      </div>

      <div
        {...editable("content.contactMap", "image", "Google Maps Karte")}
        className="relative min-h-[330px] overflow-hidden rounded-[1.15rem] border border-white/15 bg-zinc-900 shadow-[0_18px_42px_rgba(0,0,0,.24)] @min-[900px]:min-h-[380px]"
      >
        <iframe
          title={`Google Maps Standort ${partner.name || config.hero.headline}`}
          src={mapsEmbedUrl}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />
        <div className="absolute left-1/2 top-1/2 z-10 block -translate-x-1/2 -translate-y-full rounded-full bg-white/95 p-2 shadow-[0_16px_34px_rgba(0,0,0,.28)]">
          <img
            {...editable("content.contactLocationIcon", "image", "Standort-Icon")}
            src={textValue(config, "content.contactLocationIcon", "/benefitsi-location-pin.png")}
            alt=""
            className="h-20 w-20"
            style={imageStyleFor(config, "content.contactLocationIcon")}
          />
        </div>
      </div>
    </div>
  )
}

function FaqSection({ config }: { config: MicrositeConfig }) {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section id="faq" className="scroll-mt-24 bg-[#f8f6f1] px-5 py-12 @min-[640px]:px-8 @min-[1024px]:px-10">
      <div className="premium-reveal mx-auto max-w-6xl rounded-[1.65rem] border border-white/80 bg-white/95 p-5 shadow-[0_24px_70px_rgba(15,23,42,.06)] @min-[900px]:p-7">
        <div className="grid gap-5 @min-[900px]:grid-cols-[.35fr_.65fr] @min-[900px]:items-end">
          <div>
            <p
              {...editable("content.faqLabel", "text", "FAQ-Label")}
              className="text-sm font-black uppercase tracking-[.1em] text-[var(--site-accent)]"
              style={textStyleFor(config, "content.faqLabel")}
            >
              {textValue(config, "content.faqLabel", "FAQ")}
            </p>
            <h2
              {...editable("content.faqHeadline", "text", "FAQ Überschrift")}
              className="mt-3 text-[clamp(2rem,3.4vw,3.1rem)] font-black leading-[1.03] tracking-[-0.065em] text-zinc-950"
              style={textStyleFor(config, "content.faqHeadline")}
            >
              {textValue(config, "content.faqHeadline", "Häufige Fragen. Schnelle Antworten.")}
            </h2>
          </div>
          <p
            {...editable("content.faqText", "text", "FAQ Text")}
            className="max-w-2xl text-base leading-7 text-zinc-600 @min-[900px]:justify-self-end"
            style={textStyleFor(config, "content.faqText")}
          >
            {textValue(
              config,
              "content.faqText",
              "Alles Wichtige zu deiner Benefitsi Mitgliedschaft und den Vorteilen bei Knobi Döner & Pizza Haus.",
            )}
          </p>
        </div>

        <div className="mt-6 grid gap-3">
          {defaultMicrositeFaqItems.map((item, index) => (
            <FaqCard
              key={item.question}
              config={config}
              index={index}
              item={item}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqCard({
  config,
  index,
  item,
  isOpen,
  onToggle,
}: {
  config: MicrositeConfig
  index: number
  item: { question: string; answer: string }
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-[1rem] border border-zinc-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,.04)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={isOpen}
      >
        <span
          {...editable(`content.faq.${index}.question`, "text", "FAQ Frage")}
          className="text-base font-semibold leading-snug tracking-[-0.025em] text-zinc-950"
          style={textStyleFor(config, `content.faq.${index}.question`)}
        >
          {textValue(config, `content.faq.${index}.question`, item.question)}
        </span>
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full border border-zinc-200 text-zinc-700 transition ${isOpen ? "rotate-180 border-[var(--site-accent)] bg-[var(--site-accent)] text-white" : "bg-white"}`}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="none">
            <path d="m5 8 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </span>
      </button>
      {isOpen ? (
        <p
          {...editable(`content.faq.${index}.answer`, "text", "FAQ Antwort")}
          className="px-5 pb-4 text-sm leading-6 text-zinc-600"
          style={textStyleFor(config, `content.faq.${index}.answer`)}
        >
          {textValue(config, `content.faq.${index}.answer`, item.answer)}
        </p>
      ) : null}
    </div>
  )
}

function AboutValueCard({
  id,
  icon,
  fallback,
  config,
}: {
  id: string
  icon: "leaf" | "bowl" | "smile" | "pizza"
  fallback: string
  config: MicrositeConfig
}) {
  return (
    <div className="rounded-[1.05rem] border border-zinc-100 bg-white/92 px-3 py-2.5 text-center shadow-[0_14px_32px_rgba(15,23,42,.07)]">
      <ThemeIcon
        id={`${id}.icon`}
        name={icon}
        config={config}
        label="Über-uns Icon"
        className="mx-auto grid size-9 place-items-center text-[var(--site-accent)]"
        iconClassName="text-2xl leading-none"
      />
      <p
        {...editable(id, "text", "Über uns Wert")}
        className="mt-1 text-[12px] font-semibold leading-tight text-zinc-800"
        style={textStyleFor(config, id)}
      >
        {textValue(config, id, fallback)}
      </p>
    </div>
  )
}

function FooterSection({
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const footerLogoUrl = textValue(config, "footer.benefitsiLogo", "")

  return (
    <footer className="bg-[#fffdf8] px-5 pb-6 pt-0 text-sm text-zinc-600 @min-[640px]:px-8 @min-[1024px]:px-10">
      <div className="premium-reveal mx-auto grid max-w-6xl gap-6 border-t border-zinc-200/80 py-6 @min-[900px]:grid-cols-[1.55fr_.75fr_.75fr_.75fr]">
        <div>
          <div
            {...editable("footer.benefitsiLogo", "image", "Benefitsi Footer Logo")}
            className="inline-flex items-center gap-2"
          >
            {footerLogoUrl ? (
              <img
                src={footerLogoUrl}
                alt=""
                className="h-9 max-w-[180px] object-contain"
                style={imageStyleFor(config, "footer.benefitsiLogo")}
              />
            ) : (
              <BenefitsiLockup className="text-[1.45rem]" />
            )}
          </div>

          <p
            {...editable("content.footerText", "text", "Footer Text")}
            className="mt-3 max-w-[29ch] text-sm leading-6 text-zinc-600"
            style={textStyleFor(config, "content.footerText")}
          >
            {textValue(
              config,
              "content.footerText",
              "Wir verbinden Menschen mit lokalen Partnern und machen Vorteile einfach nutzbar – digital, transparent und fair.",
            )}
          </p>

          <div className="mt-4 grid max-w-[360px] grid-cols-3 gap-3">
            <FooterTrustItem id="footer.trust.0" icon="shield" label="Sicher & geprüft" config={config} />
            <FooterTrustItem id="footer.trust.1" icon="privacy" label="DSGVO konform" config={config} />
            <FooterTrustItem id="footer.trust.2" icon="local" label="Lokale Partner" config={config} />
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-xl font-black text-[#4285f4]">G</span>
            <span className="tracking-[.16em] text-[var(--site-accent)]">★★★★★</span>
            <span className="font-bold text-zinc-800">4,8 / 5,0</span>
          </div>
        </div>

        <FooterLinkColumn
          title="Für Nutzer"
          links={["Vorteile entdecken", "So funktioniert’s", "App herunterladen", "Hilfe & FAQ"]}
        />
        <FooterLinkColumn
          title="Für Partner"
          links={["Partner werden", "Partner-Login", "Vorteile anbieten", "Erfolgsgeschichten"]}
        />
        <FooterLinkColumn
          title="Über Benefitsi"
          links={["Über uns", "Karriere", "Presse", "Kontakt"]}
        />
      </div>
    </footer>
  )
}

function FooterLinkColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-black tracking-[-0.03em] text-zinc-950">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {links.map((link) => (
          <li key={link}>
            <a
              href={link === "Hilfe & FAQ" ? "#faq" : "#"}
              className="text-sm text-zinc-500 transition hover:text-[var(--site-accent)]"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FooterTrustItem({
  id,
  icon,
  label,
  config,
}: {
  id: string
  icon: "shield" | "privacy" | "local"
  label: string
  config: MicrositeConfig
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold leading-tight text-zinc-700">
      <ThemeIcon
        id={`${id}.icon`}
        name={icon}
        config={config}
        label={`${label} Icon`}
        className="grid size-7 shrink-0 place-items-center rounded-full border border-zinc-200 text-zinc-700"
        iconClassName="text-sm leading-none"
      />
      <span
        {...editable(`${id}.label`, "text", label)}
        style={textStyleFor(config, `${id}.label`)}
      >
        {textValue(config, `${id}.label`, label)}
      </span>
    </div>
  )
}

function BrandMark({
  src,
  editableId,
  style,
  size = "default",
}: {
  src?: string | null
  editableId?: string
  style?: CSSProperties
  size?: "default" | "nav" | "contact" | "mapPin"
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageFailed = Boolean(src && failedSrc === src)
  const sizeClass =
    size === "mapPin"
      ? "size-10"
      : size === "contact"
        ? "size-14 @min-[640px]:size-16"
        : size === "nav"
      ? "size-11 @min-[640px]:size-14"
      : "size-16 @min-[640px]:size-24"

  const attrs = editableId
    ? editable(editableId, "image", "Logo")
    : {}

  return src && !imageFailed ? (
    <span
      {...attrs}
      className={`grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-zinc-200/80`}
    >
      <img
        src={src}
        alt=""
        onError={() => setFailedSrc(src || null)}
        className="h-full w-full rounded-full object-cover"
        style={style}
      />
    </span>
  ) : (
    <span
      {...attrs}
      className={`grid ${sizeClass} place-items-center rounded-full bg-zinc-950 text-xs font-bold text-[var(--site-accent)]`}
      style={style}
    >
      LOGO
    </span>
  )
}

function Badge({ config }: { config: MicrositeConfig }) {
  const badgeUrl = config.branding.partnerBadgeUrl
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageFailed = Boolean(badgeUrl && failedSrc === badgeUrl)

  return (
    <div className="premium-glass-panel flex items-center gap-2 rounded-xl border border-white/80 bg-white/92 px-3 py-2 text-xs font-bold text-zinc-900 shadow-[0_16px_38px_rgba(15,23,42,.11)] backdrop-blur-xl @min-[640px]:text-sm">
      {badgeUrl && !imageFailed ? (
        <img
          {...editable("branding.partnerBadgeUrl", "image", "Badge-Icon")}
          src={badgeUrl}
          alt=""
          onError={() => setFailedSrc(badgeUrl)}
          className="size-5 object-contain drop-shadow-sm"
          style={imageStyleFor(config, "branding.partnerBadgeUrl")}
        />
      ) : (
        <span
          {...editable("branding.partnerBadgeUrl", "image", "Badge-Icon")}
          className="grid size-5 place-items-center text-sky-500 drop-shadow-sm"
        >
          <BenefitsiMark className="size-5" />
        </span>
      )}
      <span
        {...editable("hero.badgeText", "text", "Badge-Text")}
        style={textStyleFor(config, "hero.badgeText")}
      >
        {config.hero.badgeText}
      </span>
    </div>
  )
}

function MetaLine({
  id,
  iconId,
  iconName,
  text,
  accent,
  config,
}: {
  id: string
  iconId: string
  iconName: string
  text: string
  accent?: boolean
  config: MicrositeConfig
}) {
  return (
    <p
      {...editable(id, "text", id)}
      className={`flex items-center gap-4 ${accent ? "text-emerald-600" : ""}`}
      style={textStyleFor(config, id)}
    >
      <ThemeIcon
        id={iconId}
        name={iconName}
        config={config}
        label={`${text} Icon`}
        className={`grid size-6 place-items-center ${accent ? "text-emerald-500" : "text-current"}`}
        iconClassName={iconName === "status" ? "block size-3.5 animate-pulse rounded-full bg-emerald-500 ring-4 ring-emerald-100 text-transparent" : "text-lg leading-none"}
      />
      {text}
    </p>
  )
}

function HeroButton({
  id,
  label,
  primary,
  config,
}: {
  id: string
  label: string
  primary?: boolean
  config: MicrositeConfig
}) {
  return (
    <button
      {...editable(id, "text", "Startbereich Button")}
      className={`premium-button rounded-xl px-7 py-4 text-sm font-semibold transition hover:-translate-y-0.5 ${
        primary
          ? "bg-[var(--site-accent)] text-white shadow-lg"
          : "border border-zinc-200 bg-white text-zinc-900"
      }`}
      style={textStyleFor(config, id)}
    >
      {label}
    </button>
  )
}

function SmallBenefit({
  iconId,
  iconFallback,
  titleId,
  textId,
  title,
  text,
  config,
}: {
  iconId: string
  iconFallback: string
  titleId: string
  textId: string
  title: string
  text: string
  config: MicrositeConfig
}) {
  return (
    <div className="flex items-center gap-3">
      <ThemeIcon
        id={iconId}
        name={textValue(config, iconId, iconFallback)}
        config={config}
      />
      <span>
        <strong
          {...editable(titleId, "text", title)}
          className="block text-xs"
          style={textStyleFor(config, titleId)}
        >
          {title}
        </strong>
        <span
          {...editable(textId, "text", text)}
          className="block text-[11px] text-zinc-500"
          style={textStyleFor(config, textId)}
        >
          {text}
        </span>
      </span>
    </div>
  )
}

function ServiceIcon({
  id,
  name,
  config,
  className,
}: {
  id: string
  name: string
  config: MicrositeConfig
  className?: string
}) {
  return <ThemeIcon id={id} name={name} config={config} className={className} />
}

function ThemeIcon({
  id,
  name,
  config,
  label = "Icon",
  className,
  iconClassName = "size-6",
}: {
  id: string
  name: string
  config: MicrositeConfig
  label?: string
  className?: string
  iconClassName?: string
}) {
  const customImage = textValue(config, `${id}.image`, "")
  const iconSize = config.elementStyles[id]?.iconSize

  return (
    <span
      {...editable(id, "icon", label)}
      className={
        className ??
        "grid size-11 shrink-0 place-items-center rounded-xl border border-zinc-200 text-2xl text-[var(--site-accent)]"
      }
      aria-hidden="true"
      style={iconStyleFor(config, id)}
    >
      {customImage ? (
        <img
          src={customImage}
          alt=""
          className="h-[75%] w-[75%] object-contain"
          style={imageStyleFor(config, `${id}.image`)}
        />
      ) : (
        <ThemeGlyph
          name={name}
          className={iconClassName}
          style={
            iconSize
              ? { width: `${iconSize}px`, height: `${iconSize}px` }
              : undefined
          }
        />
      )}
    </span>
  )
}

function ThemeGlyph({
  name,
  className,
  style,
}: {
  name: string
  className?: string
  style?: CSSProperties
}) {
  const svgClassName = className || "size-6"

  if (name === "status") {
    return <span className={svgClassName} style={style} />
  }

  if (name === "benefitsi") {
    return <BenefitsiMark className={svgClassName} />
  }

  if (name === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={svgClassName} style={style} fill="currentColor">
        <path d="M14.2 8.4V6.9c0-.7.5-.9 1-.9h1.8V3.1c-.3 0-1.4-.1-2.7-.1-2.7 0-4.5 1.6-4.5 4.7v.7H7v3.2h2.8V21h3.5v-9.4h2.8l.5-3.2h-3.4Z" />
      </svg>
    )
  }

  if (name === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={svgClassName} style={style} fill="none">
        <rect x="5" y="5" width="14" height="14" rx="4.2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="2" />
        <circle cx="16.4" cy="7.7" r="1" fill="currentColor" />
      </svg>
    )
  }

  if (name === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={svgClassName} style={style} fill="currentColor">
        <path d="M21 8.3a3 3 0 0 0-2.1-2.1C17.1 5.7 12 5.7 12 5.7s-5.1 0-6.9.5A3 3 0 0 0 3 8.3 31 31 0 0 0 2.5 12c0 1.2.1 2.5.5 3.7a3 3 0 0 0 2.1 2.1c1.8.5 6.9.5 6.9.5s5.1 0 6.9-.5a3 3 0 0 0 2.1-2.1c.4-1.2.5-2.5.5-3.7s-.1-2.5-.5-3.7ZM10.1 15.1V8.9l5.4 3.1-5.4 3.1Z" />
      </svg>
    )
  }

  if (name === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={svgClassName} style={style} fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    )
  }

  if (name === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={svgClassName} style={style} fill="currentColor">
        <path d="M15.2 3c.4 2.3 1.7 3.7 4 3.9v3.2c-1.4.1-2.7-.3-4-1.1v5.9c0 3-2 5.6-5.2 5.6-3 0-5.2-2.1-5.2-5 0-3.5 3.4-6 6.7-4.9V14c-1.3-.5-3 .4-3 1.8 0 1 .8 1.7 1.7 1.7 1.1 0 1.8-.7 1.8-2.1V3h3.2Z" />
      </svg>
    )
  }

  if (name === "linkedin") {
    return <span className={`font-black leading-none ${svgClassName}`} style={style}>in</span>
  }

  if (name === "google") {
    return <span className={`font-black leading-none ${svgClassName}`} style={style}>G</span>
  }

  const paths: Record<string, ReactNode> = {
    bag: (
      <>
        <path d="M7 9h10l1 10H6L7 9Z" />
        <path d="M9.5 9V7a2.5 2.5 0 0 1 5 0v2" />
      </>
    ),
    leaf: (
      <>
        <path d="M19 5C11 5.3 6.7 9.6 6.5 17.5 13.8 18 17.8 13.4 19 5Z" />
        <path d="M12.5 13.2c-2.5 1.8-4.3 4.1-5.4 7" />
      </>
    ),
    card: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2.2" />
        <path d="M4 10h16M7 15h3" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8.2" r="2.5" />
        <circle cx="16" cy="9" r="2.1" />
        <path d="M4.5 19c.7-3.1 2.3-4.7 4.6-4.7s3.9 1.6 4.5 4.7M13.8 15.2c2.8.1 4.6 1.3 5.7 3.8" />
      </>
    ),
    gift: (
      <>
        <path d="M4.5 10h15v10h-15z" />
        <path d="M3.5 7h17v3h-17zM12 7v13" />
        <path d="M12 7C10.8 4.6 8.8 3.7 7.6 4.7 6.3 5.8 7.8 7.2 12 7ZM12 7c1.2-2.4 3.2-3.3 4.4-2.3 1.3 1.1-.2 2.5-4.4 2.3Z" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.2l-1.8-5.5-5.7-1.9L10.2 9 12 3.5Z" />
        <path d="M18 16.5 18.8 19l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8.8-2.5Z" />
      </>
    ),
    percent: (
      <>
        <path d="M7 17 17 7" />
        <circle cx="7.5" cy="7.5" r="2" />
        <circle cx="16.5" cy="16.5" r="2" />
      </>
    ),
    star: <path d="m12 4 2.3 5 5.5.6-4.1 3.7 1.1 5.4L12 16l-4.8 2.7 1.1-5.4-4.1-3.7 5.5-.6L12 4Z" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 8.2v4.1l3 1.8" />
      </>
    ),
    check: <path d="m5 12.4 4 3.8L19 7" />,
    home: (
      <>
        <path d="M4.5 10.8 12 4.8l7.5 6v8.4h-5v-5h-5v5h-5v-8.4Z" />
        <path d="M9.5 19.2v-5h5v5" />
      </>
    ),
    share: (
      <>
        <circle cx="7" cy="12" r="2.2" />
        <circle cx="17" cy="6.5" r="2.2" />
        <circle cx="17" cy="17.5" r="2.2" />
        <path d="m8.9 10.9 6.2-3.3M8.9 13.1l6.2 3.3" />
      </>
    ),
    qr: (
      <>
        <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5z" />
        <path d="M14 14h2.5v2.5H19M19 14v1.2M14 19h1.2M17 19h2" />
      </>
    ),
    trend: (
      <>
        <path d="M4.5 17.5 9.5 12l3.6 3.1 6.4-8.6" />
        <path d="M15.5 6.5h4v4" />
      </>
    ),
    pin: (
      <>
        <path d="M18.5 10.2c0 4.8-6.5 9.3-6.5 9.3s-6.5-4.5-6.5-9.3a6.5 6.5 0 1 1 13 0Z" />
        <circle cx="12" cy="10.2" r="2" />
      </>
    ),
    phone: <path d="M7.2 4.8 9.4 4c.7-.3 1.4.1 1.7.8l.8 2c.2.6.1 1.2-.4 1.6l-1.2 1c.9 1.8 2.4 3.3 4.2 4.2l1-1.2c.4-.5 1-.6 1.6-.4l2 .8c.7.3 1.1 1 .8 1.7l-.8 2.2c-.3.8-1 1.3-1.8 1.2C11.4 17.5 6.5 12.6 6 6.7c-.1-.8.4-1.6 1.2-1.9Z" />,
    shield: (
      <>
        <path d="M12 4.5 18 7v4.4c0 3.8-2.4 6.7-6 8.1-3.6-1.4-6-4.3-6-8.1V7l6-2.5Z" />
        <path d="m9.4 12 1.7 1.7 3.6-4" />
      </>
    ),
    privacy: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.4 1.5" />
      </>
    ),
    local: (
      <>
        <path d="M18 10c0 4.4-6 8.5-6 8.5S6 14.4 6 10a6 6 0 1 1 12 0Z" />
        <circle cx="12" cy="10" r="1.8" />
      </>
    ),
    bowl: (
      <>
        <path d="M5.2 12h13.6c-.3 4.8-3 8-6.8 8s-6.5-3.2-6.8-8Z" />
        <path d="M7.6 20h8.8M8 9.5c1.2-.9 2.5-.9 3.7 0 1.3.9 2.7.9 4 0" />
      </>
    ),
    smile: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M8.8 13.6c1.1 1.4 2.2 2 3.2 2s2.1-.6 3.2-2M9.2 9.5h.1M14.7 9.5h.1" />
      </>
    ),
    pizza: (
      <>
        <path d="M5 17.5 19 7c.8 5.4-1.6 10.3-6.1 12.3L5 17.5Z" />
        <path d="M11 11.5h.1M14.6 13.4h.1M10 16h.1" />
      </>
    ),
    website: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M4.5 12h15M12 4c2.2 2.3 3.3 5 3.3 8S14.2 17.7 12 20c-2.2-2.3-3.3-5-3.3-8S9.8 6.3 12 4Z" />
      </>
    ),
    drink: (
      <>
        <path d="M8 4h8l-1.2 16H9.2L8 4Z" />
        <path d="M7.5 7.5h9M10 4l1.1-2h3" />
        <path d="M9.3 12.2h5.4" />
      </>
    ),
    plate: (
      <>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M8.5 12h7M12 8.5v7" />
      </>
    ),
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={svgClassName}
      style={style}
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

function editable(id: string, kind: string, label: string) {
  return {
    "data-microsite-editable": id,
    "data-microsite-editable-kind": kind,
    "data-microsite-editable-label": label,
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

function navigationTabsStyleFor(config: MicrositeConfig): CSSProperties {
  const style = config.elementStyles["navigation.group"]

  return {
    ...baseElementStyle(style ?? {}),
    gap: style?.gap !== undefined ? `${style.gap}px` : undefined,
    transform: style?.xOffset ? `translateX(${style.xOffset}px)` : undefined,
  }
}

function spacingStyleFor(config: MicrositeConfig, id: string): CSSProperties {
  const style = config.elementStyles[id]

  return {
    marginTop: style?.marginTop ? `${style.marginTop}px` : undefined,
    marginBottom: style?.marginBottom ? `${style.marginBottom}px` : undefined,
  }
}

function textValue(config: MicrositeConfig, id: string, fallback: string) {
  return config.elementText[id] || fallback
}

function iconStyleFor(config: MicrositeConfig, id: string): CSSProperties {
  const style = config.elementStyles[id]

  return {
    color: style?.color,
    fontSize: style?.iconSize ? `${style.iconSize}px` : undefined,
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

function MenuCard({ item }: { item: MicrositeMenuItem }) {
  const isDrink = isDrinkItem(item)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageFailed = Boolean(item.image_url && failedSrc === item.image_url)

  return (
    <div className="premium-card premium-reveal flex gap-4 rounded-[1.15rem] border border-white/80 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,.055)]">
      {item.image_url && !imageFailed ? (
        <img
          src={item.image_url}
          alt=""
          onError={() => setFailedSrc(item.image_url)}
          className="size-20 rounded-xl object-cover"
        />
      ) : (
        <span
          className={`grid size-20 shrink-0 place-items-center rounded-xl ${
            isDrink
              ? "bg-sky-50 text-sky-600"
              : "bg-orange-50 text-[var(--site-accent)]"
          }`}
          title={isDrink ? "Getränk ohne Bild" : "Speise ohne Bild"}
        >
          <ThemeGlyph name={isDrink ? "drink" : "plate"} className="size-8" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold leading-tight tracking-[-0.03em]">
            {item.name || "Gericht"}
          </h3>
          {item.price !== null && item.price !== undefined ? (
            <span className="shrink-0 font-bold text-[var(--site-accent)]">
              {formatPrice(item.price, item.currency)}
            </span>
          ) : null}
        </div>
        {item.categoryName ? (
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[.08em] text-zinc-400">
            {item.categoryName}
          </p>
        ) : null}
        {item.description ? (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
            {item.description}
          </p>
        ) : null}
        {item.tags?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ContactInfoLine({
  id,
  icon,
  label,
  value,
  config,
}: {
  id: string
  icon: "pin" | "phone" | "clock"
  label: string
  value: string
  config: MicrositeConfig
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr] items-start gap-2">
      <ThemeIcon
        id={`${id}.icon`}
        name={icon}
        config={config}
        label={`${label} Icon`}
        className="grid size-8 place-items-center rounded-full bg-white/10 text-white"
        iconClassName="text-base leading-none"
      />
      <p>
        <span className="block text-[10px] font-black uppercase tracking-[.1em] text-zinc-500">
          {label}
        </span>
        <span
          {...editable(id, "text", label)}
          className="mt-0.5 line-clamp-2 block font-semibold leading-snug text-zinc-100"
          style={textStyleFor(config, id)}
        >
          {textValue(config, id, value)}
        </span>
      </p>
    </div>
  )
}

function SocialBadge({
  platform,
  label,
  partner,
  config,
}: {
  platform: SocialPlatform
  label: string
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const id = `social.${platform}`
  const iconUrl = textValue(config, `${id}.iconUrl`, "")
  const href = textValue(config, `${id}.url`, partnerSocialUrl(partner, platform) || "#kontakt")
  const displayLabel = textValue(
    config,
    `${id}.label`,
    partnerSocialLabel(partner, platform) || label,
  )
  const color = socialBadgeBackground(platform)

  return (
    <a
      {...editable(id, "group", `${displayLabel} Social-Media-Schaltfläche`)}
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="grid min-w-[4.5rem] justify-items-center gap-1.5 text-center text-[10px] font-semibold text-zinc-300 transition hover:-translate-y-0.5 hover:text-white"
    >
      <span
        {...editable(`${id}.iconUrl`, "image", `${displayLabel} Icon`)}
        className={`grid size-14 place-items-center overflow-hidden rounded-[1.25rem] ${color} text-white shadow-[0_12px_24px_rgba(0,0,0,.22)] ring-1 ring-white/10`}
      >
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className="h-full w-full object-contain p-1.5"
            style={imageStyleFor(config, `${id}.iconUrl`)}
          />
        ) : (
          <SocialIcon platform={platform} />
        )}
      </span>
      <span
        {...editable(`${id}.label`, "text", `${displayLabel} Label`)}
        style={textStyleFor(config, `${id}.label`)}
      >
        {displayLabel}
      </span>
    </a>
  )
}

function socialBadgeBackground(platform: SocialPlatform) {
  if (platform === "instagram") {
    return "bg-[radial-gradient(circle_at_30%_110%,#feda75_0,#fa7e1e_28%,#d62976_52%,#962fbf_75%,#4f5bd5_100%)]"
  }

  if (platform === "facebook") {
    return "bg-[#1877f2]"
  }

  if (platform === "youtube") {
    return "bg-[#ff0000]"
  }

  if (platform === "whatsapp") {
    return "bg-[#00bf6f]"
  }

  if (platform === "linkedin") {
    return "bg-[#0a66c2]"
  }

  if (platform === "google") {
    return "bg-[conic-gradient(from_180deg,#4285f4,#34a853,#fbbc05,#ea4335,#4285f4)]"
  }

  if (platform === "website") {
    return "bg-zinc-800"
  }

  return "bg-black"
}

function SocialIcon({
  platform,
  sizeClassName = "size-8",
}: {
  platform: SocialPlatform
  sizeClassName?: string
}) {
  if (platform === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={sizeClassName} fill="currentColor">
        <path d="M14.7 8.1V6.6c0-.7.4-1 1.1-1h1.9V2.4c-.3 0-1.5-.1-2.9-.1-2.8 0-4.8 1.7-4.8 4.9v.9H7v3.5h3V22h3.7V11.6h3l.6-3.5h-3.6Z" />
      </svg>
    )
  }

  if (platform === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={sizeClassName}>
        <path d="M15.2 3c.4 2.3 1.7 3.7 4 3.9v3.2c-1.4.1-2.7-.3-4-1.1v5.9c0 3-2 5.6-5.2 5.6-3 0-5.2-2.1-5.2-5 0-3.5 3.4-6 6.7-4.9V14c-1.3-.5-3 .4-3 1.8 0 1 .8 1.7 1.7 1.7 1.1 0 1.8-.7 1.8-2.1V3h3.2Z" fill="#25f4ee" transform="translate(-1 1)" />
        <path d="M15.2 3c.4 2.3 1.7 3.7 4 3.9v3.2c-1.4.1-2.7-.3-4-1.1v5.9c0 3-2 5.6-5.2 5.6-3 0-5.2-2.1-5.2-5 0-3.5 3.4-6 6.7-4.9V14c-1.3-.5-3 .4-3 1.8 0 1 .8 1.7 1.7 1.7 1.1 0 1.8-.7 1.8-2.1V3h3.2Z" fill="#fe2c55" transform="translate(1 -1)" />
        <path d="M15.2 3c.4 2.3 1.7 3.7 4 3.9v3.2c-1.4.1-2.7-.3-4-1.1v5.9c0 3-2 5.6-5.2 5.6-3 0-5.2-2.1-5.2-5 0-3.5 3.4-6 6.7-4.9V14c-1.3-.5-3 .4-3 1.8 0 1 .8 1.7 1.7 1.7 1.1 0 1.8-.7 1.8-2.1V3h3.2Z" fill="white" />
      </svg>
    )
  }

  if (platform === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={sizeClassName} fill="currentColor">
        <path d="M21 8.3a3 3 0 0 0-2.1-2.1C17.1 5.7 12 5.7 12 5.7s-5.1 0-6.9.5A3 3 0 0 0 3 8.3 31 31 0 0 0 2.5 12c0 1.2.1 2.5.5 3.7a3 3 0 0 0 2.1 2.1c1.8.5 6.9.5 6.9.5s5.1 0 6.9-.5a3 3 0 0 0 2.1-2.1c.4-1.2.5-2.5.5-3.7s-.1-2.5-.5-3.7ZM10.1 15.1V8.9l5.4 3.1-5.4 3.1Z" />
      </svg>
    )
  }

  if (platform === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={sizeClassName} fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    )
  }

  if (platform === "linkedin") {
    return <span className={`font-black leading-none ${sizeClassName}`}>in</span>
  }

  if (platform === "website") {
    return <ThemeGlyph name="website" className="size-7" />
  }

  if (platform === "google") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={sizeClassName}>
        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5L15.4 17c-.9.6-2 .9-3.4.9a5.9 5.9 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.5 13.9a6 6 0 0 1 0-3.8V7.5H3.2a10 10 0 0 0 0 9l3.3-2.6Z" />
        <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.5 9.5 0 0 0 12 2 10 10 0 0 0 3.2 7.5l3.3 2.6A5.9 5.9 0 0 1 12 6.1Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={sizeClassName} fill="none">
      <rect x="4.8" y="4.8" width="14.4" height="14.4" rx="4.4" stroke="currentColor" strokeWidth="2.3" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2.3" />
      <circle cx="16.5" cy="7.7" r="1.15" fill="currentColor" />
    </svg>
  )
}

function socialVisible(
  config: MicrositeConfig,
  partner: PartnerWithDeals,
  platform: SocialPlatform,
  defaultVisible: boolean,
) {
  const value = config.elementText[`social.${platform}.enabled`]

  if (value === "true") {
    return true
  }

  if (value === "false") {
    return false
  }

  if (partnerSocialUrl(partner, platform)) {
    return true
  }

  return defaultVisible
}

function mapsQueryForPartner(partner: PartnerWithDeals, fallbackAddress: string) {
  const coordinates = parseMicrositeCoordinates(partner.coordinates)

  if (coordinates) {
    return `${coordinates.latitude},${coordinates.longitude}`
  }

  return fallbackAddress
}

function contactAddressFor(partner: PartnerWithDeals, config: MicrositeConfig) {
  const partnerName = `${partner.name || ""} ${partner.slug || ""} ${partner.subdomain || ""}`
  const looksLikeKnobi = /knobi/i.test(partnerName)
  const address = partner.address?.trim()
  const isRealAddress =
    address &&
    address.length <= 72 &&
    !/\b(is a|located|restaurant|specializing|well-known)\b/i.test(address)

  if (isRealAddress) {
    return address
  }

  if (looksLikeKnobi) {
    return "Landauer Str. 70, 76855 Annweiler am Trifels"
  }

  return config.hero.locationText || address || "Adresse im Admin ergänzen"
}

function parseMicrositeCoordinates(value: PartnerWithDeals["coordinates"]) {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    const trimmed = value.trim()

    if (!trimmed) {
      return null
    }

    try {
      return parseMicrositeCoordinates(JSON.parse(trimmed) as PartnerWithDeals["coordinates"])
    } catch {
      const pair = trimmed.split(",").map((part) => Number(part.trim()))

      if (pair.length === 2 && pair.every(Number.isFinite)) {
        return { latitude: pair[0], longitude: pair[1] }
      }

      return null
    }
  }

  if (
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude)
  ) {
    return { latitude: value.latitude, longitude: value.longitude }
  }

  return null
}

function menuItemsForPartner(partner: PartnerWithDeals): MicrositeMenuItem[] {
  return partner.menus.flatMap((menu) => {
    const categoryItems = menu.categories.flatMap((category) =>
      category.items.map((item) => ({
        ...item,
        categoryName: category.name,
      })),
    )

    if (categoryItems.length) {
      return categoryItems
    }

    const categoryNames = new Map(
      menu.categories.map((category) => [category.id, category.name]),
    )

    return menu.items.map((item) => ({
      ...item,
      categoryName: item.category_id
        ? categoryNames.get(item.category_id) ?? null
        : null,
    }))
  })
}

function rewardLabelForStamp(
  milestones: PartnerRewardMilestone[],
  stamp: number,
  isMainReward: boolean,
) {
  const exact = milestones.find((milestone) => milestone.required_stamps === stamp)
  const fallbackMain = milestones.find((milestone) => milestone.required_stamps)
  const milestone = exact || (isMainReward ? fallbackMain : null)

  return translateRewardLabel(
    milestone?.title ||
    milestone?.reward_item ||
    milestone?.customer_description ||
    (isMainReward ? "Hauptbelohnung" : "Bonus"),
  )
}

function rewardImageForStamp(
  partner: PartnerWithDeals,
  config: MicrositeConfig,
  stamp: number,
  isMainReward: boolean,
) {
  const rewardLabel = rewardLabelForStamp(
    partner.reward_milestones,
    stamp,
    isMainReward,
  ).toLowerCase()
  const menuItems = menuItemsForPartner(partner)
  const isDoenerReward = /döner|doener|doner|kebab/.test(rewardLabel)
  const isDrinkReward = /getränk|drink|ayran|cola|wasser|saft|limonade/.test(
    rewardLabel,
  )

  if (isDoenerReward) {
    const doenerItem = menuItems.find(
      (item) =>
        item.image_url && /döner|doener|doner|kebab/i.test(item.name || ""),
    )

    return (
      doenerItem?.image_url ||
      config.deals.topDealImageUrl ||
      config.hero.backgroundImageUrl
    )
  }

  if (isDrinkReward) {
    const drinkItem = menuItems.find((item) => item.image_url && isDrinkItem(item))

    return (
      drinkItem?.image_url ||
      config.deals.illustrationUrl ||
      config.deals.topDealImageUrl
    )
  }

  const matchingItem = menuItems.find((item) => {
    const haystack = [item.name, item.description, item.categoryName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    return (
      item.image_url &&
      rewardLabel
        .replace(/gratis|kostenlos|free/g, "")
        .split(/\s+/)
        .filter((part) => part.length > 2)
        .some((part) => haystack.includes(part))
    )
  })

  if (matchingItem?.image_url) {
    return matchingItem.image_url
  }

  return config.deals.topDealImageUrl || config.deals.illustrationUrl || config.hero.backgroundImageUrl
}

function rewardGridColumn(stamp: number, stampCount: number) {
  if (stampCount < 6) {
    return "1 / -1"
  }

  if (stamp === stampCount) {
    return `${Math.max(1, stampCount - 2)} / span 3`
  }

  return `${Math.max(1, stamp - 1)} / span 3`
}

function rewardArrowPosition(stamp: number, stampCount: number) {
  if (stampCount < 6) {
    return "50%"
  }

  const columnStart = stamp === stampCount ? Math.max(1, stampCount - 2) : Math.max(1, stamp - 1)
  const positionInThreeColumnCard = ((stamp - columnStart + 0.5) / 3) * 100
  const clamped = Math.min(84, Math.max(16, positionInThreeColumnCard))

  return `${clamped}%`
}

function translateRewardLabel(value: string) {
  const normalized = value.trim()
  const lower = normalized.toLowerCase()
  const replacements: Array<[RegExp, string]> = [
    [/^free\s+d[oö]ner$/, "Gratis Döner"],
    [/^free\s+drink$/, "Gratis Getränk"],
    [/^free\s+ayran$/, "Gratis Ayran"],
    [/^free\s+pizza$/, "Gratis Pizza"],
    [/^free\s+dessert$/, "Gratis Dessert"],
    [/^bonus$/, "Bonus"],
    [/^main\s+reward$/, "Hauptbelohnung"],
  ]

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(lower)) {
      return replacement
    }
  }

  if (lower.startsWith("free ")) {
    return `Gratis ${normalized.slice(5)}`
  }

  return normalized
}

function menuFiltersForItems(items: MicrositeMenuItem[]): MenuFilter[] {
  const categoryNames = Array.from(
    new Set(items.map((item) => item.categoryName).filter(Boolean)),
  ) as string[]

  return [
    {
      id: "all",
      label: "Alle",
      predicate: () => true,
    },
    {
      id: "food",
      label: "Alle Speisen",
      predicate: (item) => !isDrinkItem(item),
    },
    {
      id: "drinks",
      label: "Alle Getränke",
      predicate: isDrinkItem,
    },
    ...categoryNames.map((categoryName) => ({
      id: `category-${slugForFilter(categoryName)}`,
      label: categoryName,
      predicate: (item: MicrositeMenuItem) => item.categoryName === categoryName,
    })),
  ]
}

function isDrinkItem(item: MicrositeMenuItem) {
  const haystack = [
    item.name,
    item.description,
    item.categoryName,
    ...(item.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return /getränk|drink|cola|fanta|sprite|wasser|ayran|bier|wein|saft|schorle|limonade|eistee|kaffee|espresso|cappuccino|tee/.test(
    haystack,
  )
}

function slugForFilter(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function formatPrice(value: number | string, currency?: string | null) {
  const numeric = typeof value === "string" ? Number(value) : value

  if (!Number.isFinite(numeric)) {
    return String(value)
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(numeric)
}

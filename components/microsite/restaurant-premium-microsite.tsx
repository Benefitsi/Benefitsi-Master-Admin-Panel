/* eslint-disable @next/next/no-img-element -- Microsite assets are admin-selected storage URLs and may use partner-specific hosts. */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import {
  Award,
  BadgeCheck,
  BellRing,
  Check,
  Circle,
  ChevronLeft,
  ChevronDown,
  Clock3,
  CreditCard,
  CupSoda,
  Gift,
  Globe2,
  Heart,
  House,
  Leaf,
  LockKeyhole,
  Mail,
  MapPin,
  MapPinned,
  Menu as MenuIcon,
  Minus,
  Percent,
  Phone,
  Pizza,
  Plus,
  QrCode,
  Quote as QuoteIcon,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Smile,
  Soup,
  Sparkles,
  Star,
  TrendingUp,
  UsersRound,
  Utensils,
  ArrowRight,
  Flame,
  X,
  type LucideIcon,
} from "lucide-react"
import {
  FaFacebookF,
  FaGoogle,
  FaInstagram,
  FaLinkedinIn,
  FaTiktok,
  FaWhatsapp,
  FaYoutube,
} from "react-icons/fa6"
import type { IconType } from "react-icons"
import type {
  Deal,
  MenuItem,
  PartnerRewardMilestone,
  PartnerWithDeals,
} from "@/lib/admin-data"
import {
  getMicrositePublicDeals,
  getMicrositeStampDeals,
  getMicrositeStampRewards,
  getMicrositeWelcomeDeals,
  micrositeDealDescription,
  micrositeDealDetails,
  micrositeDealTypeLabel,
  micrositeDealTitle,
  micrositeRewardTrackLabel,
  micrositeStampRewardDescription,
  micrositeStampRewardTitle,
  micrositeWelcomeStampCount,
  micrositeWelcomeTitle,
} from "@/lib/microsite-content"
import { isMicrositeTopDeal } from "@/lib/microsite-deals"
import type { MicrositeConfig, MicrositeElementStyle } from "@/lib/microsites"
import { defaultMicrositeFaqItems } from "@/lib/microsite-seo"
import {
  partnerSocialLabel,
  partnerSocialUrl,
} from "@/lib/microsite-personalization"
import { extractThemePalette } from "@/lib/logo-palette"
import {
  micrositeMenuItemDisplayName,
  micrositeMenuItemImageId,
  micrositeMenuPreviewItems,
  micrositeMenuItemVisibilityId,
} from "@/lib/microsite-menu"

type MicrositeMenuItem = MenuItem & {
  categoryName?: string | null
  micrositeImageId?: string
  micrositeShowImage?: boolean
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
}> = [
  { platform: "instagram", label: "Instagram" },
  { platform: "facebook", label: "Facebook" },
  { platform: "tiktok", label: "TikTok" },
  { platform: "youtube", label: "YouTube" },
  { platform: "whatsapp", label: "WhatsApp" },
  { platform: "website", label: "Website" },
  { platform: "google", label: "Google" },
  { platform: "linkedin", label: "LinkedIn" },
]

const BENEFITSI_ICON_SRC = "/Benefitsi_Icon_FullColor_RGB_512.png"
const BENEFITSI_APP_QR_SRC =
  process.env.NEXT_PUBLIC_BENEFITSI_APP_QR_URL ||
  "/benefitsi-app-qr-placeholder.png"
const PARTNER_DETAIL_SCREEN_SRC = "/partner-details-page.jpg"
const SOCIAL_FEED_POST_INDICES = [0, 1, 2, 3, 4, 5] as const

function micrositeThemeVars(config: MicrositeConfig): CSSProperties {
  const isDark = config.appearance?.mode === "dark"

  return {
    "--site-brand": "#118cff",
    "--site-bg": isDark ? "#101216" : "#f4f8fc",
    "--site-surface": isDark ? "#181b21" : "#ffffff",
    "--site-soft": isDark
      ? "#151a20"
      : "color-mix(in srgb, var(--site-accent) 5%, #f2f7fc)",
    "--site-text": isDark ? "#f8fafc" : "#151515",
    "--site-muted": isDark ? "#cbd5e1" : "#52525b",
    "--site-border": isDark ? "rgba(255,255,255,.12)" : "rgba(228,228,231,.88)",
  } as CSSProperties
}

function useResolvedPalette(config: MicrositeConfig, logoUrl: string) {
  const configured = useMemo(
    () => ({
      primary: config.branding.accent,
      secondary: config.branding.accentSecondary,
      tertiary: config.branding.accentTertiary,
    }),
    [
      config.branding.accent,
      config.branding.accentSecondary,
      config.branding.accentTertiary,
    ],
  )
  const [palette, setPalette] = useState(configured)

  useEffect(() => {
    if (config.branding.paletteMode === "manual") return

    let active = true
    extractThemePalette(logoUrl).then((nextPalette) => {
      if (active) {
        setPalette({
          primary: nextPalette.primary,
          secondary: nextPalette.secondary,
          tertiary: nextPalette.tertiary,
        })
      }
    })

    return () => {
      active = false
    }
  }, [config.branding.paletteMode, configured, logoUrl])

  return config.branding.paletteMode === "manual" ? configured : palette
}

function restaurantTheme() {
  return {
    shell: "bg-[var(--site-bg)] text-[#151515] shadow-[0_30px_90px_rgba(15,23,42,.10)]",
    header: "border-zinc-200/70 bg-white/96",
    mobileButton: "text-zinc-900 hover:bg-zinc-50",
    mobilePanel: "border-zinc-200 bg-white text-zinc-800 shadow-[0_24px_64px_rgba(15,23,42,.18)]",
  }
}

function restaurantSectionClass(
  template: string,
  section: "deals" | "menu" | "about",
) {
  void template
  void section
  return "bg-[var(--site-bg)]"
}

function siteCopy(config: MicrositeConfig, german: string, english: string) {
  return config.language === "en" ? english : german
}

export function RestaurantPremiumMicrosite({
  partner,
  config,
  showAppDownloadPopup = true,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  showAppDownloadPopup?: boolean
}) {
  const theme = restaurantTheme()
  const palette = useResolvedPalette(
    config,
    config.branding.logoUrl || partner.logo_url || "",
  )
  const style = {
    ...micrositeThemeVars(config),
    "--site-accent": palette.primary,
    "--site-secondary": palette.secondary,
    "--site-tertiary": palette.tertiary,
  } as CSSProperties
  const isDark = config.appearance?.mode === "dark"

  return (
    <article
      lang={config.language}
      style={style}
      className={`premium-microsite @container relative isolate w-full min-w-0 max-w-full overflow-visible rounded-none [overflow-wrap:anywhere] @min-[480px]:rounded-[1.6rem] ${
        isDark
          ? "premium-microsite-dark bg-[var(--site-bg)] text-[var(--site-text)] shadow-[0_30px_90px_rgba(0,0,0,.32)]"
          : theme.shell
      }`}
    >
      <MicrositeThemeCss />
      <PremiumMotionEffects />
      <SiteHeader
        partner={partner}
        config={config}
        theme={theme}
      />
      <HeroSection config={config} template={config.template} />
      <DealsSection partner={partner} config={config} template={config.template} />
      <PartnerSocialFeed partner={partner} config={config} />
      <MenuSection partner={partner} config={config} template={config.template} />
      <QuoteSection config={config} />
      <AboutContactSection partner={partner} config={config} template={config.template} />
      <FaqSection config={config} />
      <FooterSection partner={partner} config={config} />
      {showAppDownloadPopup ? (
        <AppDownloadQrPopup partner={partner} config={config} />
      ) : null}
    </article>
  )
}

function MicrositeThemeCss() {
  return (
    <style>{`
      .premium-microsite {
        --ease-out-expo: cubic-bezier(.16, 1, .3, 1);
        accent-color: var(--site-accent);
        scrollbar-color: color-mix(in srgb, var(--site-accent) 65%, transparent) transparent;
      }

      .premium-microsite ::selection {
        background: color-mix(in srgb, var(--site-tertiary) 38%, white);
        color: var(--site-secondary);
      }

      .premium-microsite :focus-visible {
        outline: 3px solid color-mix(in srgb, var(--site-tertiary) 75%, white);
        outline-offset: 4px;
      }

      .premium-motion-ready .premium-reveal.premium-reveal-pending {
        opacity: .01;
        filter: blur(7px);
        transform: translate3d(0, 26px, 0);
        transition:
          opacity .72s var(--ease-out-expo),
          filter .72s var(--ease-out-expo),
          transform .78s var(--ease-out-expo);
        transition-delay: calc(var(--reveal-index, 0) * 45ms);
      }

      .premium-motion-ready .premium-reveal.premium-reveal-pending.is-visible {
        opacity: 1;
        filter: blur(0);
        transform: translate3d(0, 0, 0);
      }

      .premium-parallax {
        transform: translate3d(0, var(--parallax-y, 0), 0) scale(1.045);
        will-change: transform;
      }

      .premium-hero-stage {
        isolation: isolate;
      }

      .premium-hero-media-inner {
        inset: 0 0 auto;
        height: 490px;
        isolation: isolate;
        -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 73%, rgba(0,0,0,.84) 84%, transparent 100%);
        mask-image: linear-gradient(180deg, #000 0%, #000 73%, rgba(0,0,0,.84) 84%, transparent 100%);
      }

      .premium-hero-stage::after {
        content: "";
        position: absolute;
        inset: auto 0 0;
        z-index: 3;
        height: 25%;
        pointer-events: none;
        background: linear-gradient(180deg, transparent, rgba(244,248,252,.32) 44%, var(--site-bg) 100%);
      }

      .premium-hero-glass {
        display: none;
        position: absolute;
        inset: 285px 0 auto;
        height: 270px;
        width: 100%;
        background: linear-gradient(180deg, transparent 0%, rgba(249,252,255,.32) 28%, rgba(244,248,252,.94) 73%, var(--site-bg) 100%);
        -webkit-backdrop-filter: blur(8px) saturate(112%);
        backdrop-filter: blur(8px) saturate(112%);
        -webkit-mask-image: linear-gradient(180deg, transparent, #000 34%, #000 100%);
        mask-image: linear-gradient(180deg, transparent, #000 34%, #000 100%);
      }

      .premium-hero-badge {
        left: 1.25rem;
        top: 2rem;
      }

      .premium-hero-content {
        width: 100%;
        padding-inline: 1.5rem;
      }

      .premium-hero-title-panel {
        width: fit-content;
        max-width: 100%;
        margin-inline: 0;
        padding: 0 .75rem .55rem;
        border: 1px solid rgba(255,255,255,.76);
        border-radius: 1.25rem;
        background:
          radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--site-accent) 12%, transparent), transparent 48%),
          linear-gradient(145deg, rgba(255,255,255,.82), rgba(247,250,252,.64));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.96),
          0 18px 42px -30px color-mix(in srgb, var(--site-secondary) 50%, transparent);
        -webkit-backdrop-filter: blur(18px) saturate(140%);
        backdrop-filter: blur(18px) saturate(140%);
      }

      .premium-hero-flow {
        position: relative;
        inset: auto;
        top: auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding-block: 30.625rem 1.25rem;
      }

      .premium-hero-ambient {
        position: absolute;
        right: 1rem;
        top: 2.5rem;
        z-index: 2;
        width: min(52vw, 34rem);
        aspect-ratio: 1;
        border-radius: 999px;
        pointer-events: none;
        opacity: .16;
        filter: blur(22px);
        background: radial-gradient(circle, color-mix(in srgb, var(--site-accent) 65%, white) 0%, color-mix(in srgb, var(--site-tertiary) 24%, transparent) 38%, transparent 70%);
        animation: premium-hero-ambient-drift 10s ease-in-out infinite alternate;
      }

      .premium-feature-row {
        isolation: isolate;
        color: var(--site-secondary);
        background:
          radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--site-accent) 13%, transparent), transparent 38%),
          linear-gradient(135deg, rgba(255,255,255,.64), rgba(239,247,255,.38));
        -webkit-backdrop-filter: blur(24px) saturate(155%) contrast(102%);
        backdrop-filter: blur(24px) saturate(155%) contrast(102%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.92),
          inset 0 -1px 0 rgba(255,255,255,.34),
          inset 1px 0 0 rgba(255,255,255,.46),
          0 22px 54px -28px color-mix(in srgb, var(--site-brand) 38%, transparent),
          0 8px 20px -16px color-mix(in srgb, var(--site-accent) 26%, transparent);
      }

      .premium-feature-row::before,
      .premium-feature-row::after {
        content: "";
        position: absolute;
        pointer-events: none;
        border-radius: inherit;
      }

      .premium-feature-row::before {
        inset: 1px;
        z-index: 0;
        background: linear-gradient(155deg, rgba(255,255,255,.52), transparent 36%, rgba(255,255,255,.15) 68%, rgba(255,255,255,.34));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.28);
      }

      .premium-hero-service-icon {
        color: color-mix(in srgb, var(--site-accent) 72%, var(--site-brand));
        background: rgba(255,255,255,.58);
        border: 1px solid rgba(255,255,255,.72);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.96),
          inset 0 -1px 0 color-mix(in srgb, var(--site-brand) 10%, transparent),
          0 8px 18px -14px color-mix(in srgb, var(--site-secondary) 42%, transparent);
        -webkit-backdrop-filter: blur(14px) saturate(145%);
        backdrop-filter: blur(14px) saturate(145%);
      }

      .premium-hero-service-label {
        color: var(--site-secondary);
        text-decoration: none;
        text-shadow: 0 1px 0 rgba(255,255,255,.64);
      }

      .premium-hero-service-description {
        color: #51483f;
      }

      .premium-feature-row::after {
        inset: -20%;
        z-index: 0;
        opacity: .22;
        background: linear-gradient(112deg, transparent 28%, rgba(255,255,255,.12) 42%, rgba(255,255,255,.78) 50%, rgba(255,255,255,.12) 58%, transparent 72%);
        mix-blend-mode: screen;
        transform: translate3d(-48%, 0, 0);
        animation: premium-liquid-glint 1.75s var(--ease-out-expo) .7s both;
      }

      @container (min-width: 640px) {
        .premium-hero-title-panel {
          width: auto;
          max-width: none;
          margin-inline: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: none;
          box-shadow: none;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }

        .premium-hero-media-inner {
          inset: 0;
          height: 100%;
          -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 90%, rgba(0,0,0,.92) 96%, transparent 100%);
          mask-image: linear-gradient(180deg, #000 0%, #000 90%, rgba(0,0,0,.92) 96%, transparent 100%);
        }

        .premium-hero-stage::after {
          height: 14%;
        }

        .premium-hero-glass {
          display: block;
          inset: 0 auto 0 0;
          height: auto;
          width: 70%;
          background: linear-gradient(
            90deg,
            rgba(249, 252, 255, .84) 0%,
            rgba(247, 251, 255, .70) 78%,
            rgba(246, 250, 255, .54) 84%,
            rgba(244, 249, 254, .32) 90%,
            rgba(242, 248, 255, .14) 95%,
            rgba(242, 248, 255, 0) 100%
          );
          -webkit-backdrop-filter: blur(20px) saturate(118%);
          backdrop-filter: blur(20px) saturate(118%);
          -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 78%, rgba(0,0,0,.94) 84%, rgba(0,0,0,.68) 90%, rgba(0,0,0,.3) 96%, transparent 100%);
          mask-image: linear-gradient(90deg, #000 0%, #000 78%, rgba(0,0,0,.94) 84%, rgba(0,0,0,.68) 90%, rgba(0,0,0,.3) 96%, transparent 100%);
        }

        .premium-hero-badge {
          left: 2rem;
          top: 2rem;
        }

        .premium-hero-flow {
          position: absolute;
          inset: 0 0 auto;
          top: 4.5rem;
          gap: 1.75rem;
          padding-block: 0;
        }

        .premium-hero-content {
          width: 64%;
          max-width: 510px;
          padding-inline: 2rem;
        }
      }

      @container (min-width: 1024px) {
        .premium-hero-glass {
          width: 59%;
          background: linear-gradient(
            90deg,
            rgba(249, 252, 255, .88) 0%,
            rgba(247, 251, 255, .72) 78%,
            rgba(246, 250, 255, .56) 84%,
            rgba(244, 249, 254, .34) 90%,
            rgba(242, 248, 255, .14) 95%,
            rgba(242, 248, 255, 0) 100%
          );
          -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 78%, rgba(0,0,0,.94) 84%, rgba(0,0,0,.68) 90%, rgba(0,0,0,.3) 96%, transparent 100%);
          mask-image: linear-gradient(90deg, #000 0%, #000 78%, rgba(0,0,0,.94) 84%, rgba(0,0,0,.68) 90%, rgba(0,0,0,.3) 96%, transparent 100%);
        }

        .premium-hero-badge {
          left: 3rem;
          top: 1.75rem;
        }

        .premium-hero-flow {
          top: 4.25rem;
        }

        .premium-hero-content {
          width: 54%;
          max-width: 650px;
          padding-inline: 3rem;
        }
      }

      .premium-feature-row > * {
        position: relative;
        z-index: 1;
        transition: transform .38s var(--ease-out-expo), color .38s ease;
      }

      .premium-feature-row > *:hover {
        transform: translateY(-2px);
      }

      .premium-liquid-panel {
        position: relative;
        isolation: isolate;
        color: #211b16;
        border: 1px solid rgba(255,255,255,.82);
        background:
          radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--site-accent) 10%, transparent), transparent 38%),
          linear-gradient(135deg, rgba(255,255,255,.72), rgba(255,249,241,.43));
        -webkit-backdrop-filter: blur(28px) saturate(165%) contrast(102%);
        backdrop-filter: blur(28px) saturate(165%) contrast(102%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.96),
          inset 0 -1px 0 rgba(255,255,255,.30),
          0 26px 68px -34px rgba(103,57,21,.34),
          0 10px 28px -24px rgba(103,57,21,.25);
      }

      .premium-liquid-panel::before,
      .premium-liquid-panel::after {
        content: "";
        position: absolute;
        pointer-events: none;
        border-radius: inherit;
      }

      .premium-liquid-panel::before {
        inset: 1px;
        z-index: 0;
        background: linear-gradient(150deg, rgba(255,255,255,.48), transparent 34%, rgba(255,255,255,.12) 72%, rgba(255,255,255,.34));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.24);
      }

      .premium-liquid-panel::after {
        inset: -35%;
        z-index: 0;
        opacity: 0;
        background: linear-gradient(112deg, transparent 38%, rgba(255,255,255,.68) 50%, transparent 62%);
        mix-blend-mode: screen;
        transform: translate3d(-34%, 0, 0);
        transition: opacity .35s ease;
      }

      .premium-liquid-panel > :not(.absolute) {
        position: relative;
        z-index: 1;
      }

      .premium-liquid-panel > .absolute {
        position: absolute;
      }

      @media (hover: hover) {
        .premium-liquid-panel:hover::after {
          opacity: .34;
          animation: premium-liquid-hover 1.15s var(--ease-out-expo) both;
        }
      }

      .premium-ecosystem-card {
        transition: transform .5s var(--ease-out-expo), box-shadow .5s var(--ease-out-expo), border-color .35s ease;
      }

      .premium-ecosystem-card:hover {
        transform: translate3d(0,-5px,0) rotate(.2deg);
        border-color: color-mix(in srgb, var(--site-accent) 35%, white);
        box-shadow: 0 32px 72px -36px color-mix(in srgb, var(--site-accent) 42%, #6b3b20);
      }

      .premium-branded-image {
        position: relative;
        isolation: isolate;
        display: grid;
        place-items: center;
        overflow: hidden;
        background:
          radial-gradient(circle at 18% 14%, color-mix(in srgb, var(--site-tertiary) 18%, transparent), transparent 34%),
          radial-gradient(circle at 82% 84%, color-mix(in srgb, var(--site-accent) 13%, transparent), transparent 38%),
          linear-gradient(145deg, #ffffff, #fffaf3);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.84);
      }

      .premium-branded-image::before {
        content: "";
        position: absolute;
        inset: 0;
        opacity: .16;
        background-image: radial-gradient(circle, color-mix(in srgb, var(--site-accent) 24%, transparent) 1px, transparent 1px);
        background-size: 18px 18px;
        mask-image: linear-gradient(145deg, #000, transparent 74%);
      }

      .premium-app-screen {
        -webkit-text-size-adjust: none;
        text-size-adjust: none;
        transition: transform .65s var(--ease-out-expo), box-shadow .65s var(--ease-out-expo);
      }

      .premium-phone-compact-label {
        font-size: 5.25px !important;
        font-weight: 700;
        line-height: 1.1 !important;
        letter-spacing: 0;
        white-space: nowrap;
      }

      .premium-app-screen:hover {
        transform: translate3d(0,-6px,0) scale(1.012);
        box-shadow: 0 42px 90px -42px color-mix(in srgb, var(--site-accent) 50%, #3f2818);
      }

      .premium-phone-view {
        animation: premium-phone-view-enter .24s var(--ease-out-expo) both;
      }

      .premium-phone-scroll {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
        overscroll-behavior-x: none;
        touch-action: pan-y;
        scrollbar-width: none;
      }

      .premium-phone-scroll > * {
        max-width: 100%;
      }

      .premium-phone-scroll::-webkit-scrollbar {
        display: none;
      }

      .premium-instagram-embed,
      .premium-instagram-embed .instagram-media,
      .premium-instagram-embed iframe {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
      }

      .premium-instagram-embed .instagram-media {
        margin: 0 !important;
      }

      @keyframes premium-phone-view-enter {
        from { opacity: 0; transform: translate3d(8px,0,0); }
        to { opacity: 1; transform: translate3d(0,0,0); }
      }

      .premium-app-cta {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        background: linear-gradient(112deg, color-mix(in srgb, var(--site-accent) 91%, var(--site-secondary)), color-mix(in srgb, var(--site-accent) 82%, var(--site-tertiary)));
        box-shadow: 0 22px 44px -24px color-mix(in srgb, var(--site-accent) 76%, var(--site-secondary));
      }

      .premium-app-cta::after {
        content: "";
        position: absolute;
        inset: -80% -30%;
        z-index: -1;
        opacity: .7;
        background: linear-gradient(110deg, transparent 42%, rgba(255,255,255,.48) 50%, transparent 58%);
        transform: translate3d(-58%,0,0);
        animation: premium-app-cta-sheen 4.8s ease-in-out infinite;
      }

      .premium-button-shine {
        position: relative;
        isolation: isolate;
        overflow: hidden;
      }

      .premium-button-shine::after {
        content: "";
        position: absolute;
        inset: -80% -35%;
        z-index: 2;
        pointer-events: none;
        opacity: .62;
        background: linear-gradient(110deg, transparent 42%, rgba(255,255,255,.52) 50%, transparent 58%);
        mix-blend-mode: screen;
        transform: translate3d(-58%,0,0);
        animation: premium-app-cta-sheen 4.4s ease-in-out infinite;
      }

      .premium-button-shine-subtle::after {
        opacity: .28;
        animation-duration: 5.4s;
      }

      .premium-faq-item {
        transition: transform .38s var(--ease-out-expo), border-color .3s ease, box-shadow .38s ease;
      }

      .premium-faq-item:hover,
      .premium-faq-item:focus-within {
        transform: translate3d(4px,-1px,0);
        border-color: color-mix(in srgb, var(--site-accent) 36%, white);
        box-shadow: 0 20px 52px -34px color-mix(in srgb, var(--site-accent) 48%, #60351f);
      }

      @keyframes premium-liquid-hover {
        from { transform: translate3d(-34%,0,0); }
        to { transform: translate3d(34%,0,0); }
      }

      @keyframes premium-app-cta-sheen {
        0%, 55% { transform: translate3d(-58%,0,0); }
        78%, 100% { transform: translate3d(58%,0,0); }
      }

      .premium-quote-rule {
        background: linear-gradient(90deg, var(--site-accent), var(--site-tertiary), var(--site-secondary));
        transform-origin: center;
        transition: transform .8s var(--ease-out-expo);
      }

      .premium-motion-ready .premium-quote-shell:not(:has(.is-visible)) .premium-quote-rule {
        transform: scaleX(.18);
      }

      .premium-motion-ready .premium-topdeal.is-active {
        opacity: 1;
        filter: blur(0);
        transform: translate3d(0, 0, 0);
      }

      .premium-topdeal.is-active > img {
        will-change: transform, filter;
        animation: premium-topdeal-image-enter .88s var(--ease-out-expo) both;
      }

      .premium-topdeal > img {
        transition: filter .5s ease, transform .8s var(--ease-out-expo);
      }

      @media (hover: hover) {
        .premium-topdeal:hover > img {
          filter: saturate(1.08) brightness(1.04);
          transform: scale(1.025);
        }
      }

      .premium-stamp-panel {
        z-index: 2;
        overflow: visible;
      }

      .premium-stamp-story {
        isolation: isolate;
      }

      .premium-about-background {
        opacity: .32;
        filter: saturate(.82) contrast(.94);
      }

      .premium-about-scrim {
        background: linear-gradient(
          180deg,
          rgba(255,255,255,.78) 0%,
          rgba(255,255,255,.88) 52%,
          rgba(255,255,255,.94) 100%
        );
      }

      @container (min-width: 900px) {
        .premium-about-background {
          opacity: 1;
          filter: none;
        }

        .premium-about-scrim {
          background: linear-gradient(90deg,#fff 0%,#fff 42%,rgba(255,255,255,.82) 54%,rgba(255,255,255,.18) 73%,rgba(255,255,255,0) 100%);
        }
      }

      .premium-stamp-circle[data-completed="true"] {
        border-color: #10b981 !important;
        background: color-mix(in srgb, #10b981 10%, white) !important;
        color: #047857 !important;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.62) !important;
      }

      .premium-stamp-circle[data-completed="true"][data-highlighted="true"] {
        border-color: var(--site-accent) !important;
        background: color-mix(in srgb, var(--site-accent) 12%, white) !important;
        color: var(--site-accent) !important;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.62) !important;
      }

      .premium-stamp-circle[data-current="true"] .premium-stamp-number {
        animation: premium-stamp-number-pop .26s cubic-bezier(.2, 1.55, .5, 1) both;
      }

      .premium-stamp-circle[data-current="true"] .premium-stamp-check {
        animation: premium-stamp-check-pop .21s cubic-bezier(.2, 1.45, .45, 1) .07s both;
      }

      .premium-stamp-circle[data-current="true"] .premium-stamp-gift {
        animation: premium-stamp-check-pop .24s cubic-bezier(.2, 1.45, .45, 1) .07s both;
      }

      .premium-stamp-check svg,
      .premium-stamp-welcome-icon svg {
        stroke-width: 2.8;
      }

      @keyframes premium-stamp-number-pop {
        0% { transform: translateY(1px) scale(.78); }
        58% { transform: translateY(-2px) scale(1.2); }
        100% { transform: translateY(0) scale(1); }
      }

      @keyframes premium-stamp-check-pop {
        from { opacity: 0; transform: scale(.55) rotate(-12deg); }
        to { opacity: 1; transform: scale(1) rotate(0); }
      }

      @keyframes premium-hero-image-focus {
        from {
          opacity: .54;
          filter: blur(10px) saturate(.72) brightness(.9);
          clip-path: inset(2.5% 2.5% 2.5% 2.5% round 1.75rem);
        }
        to {
          opacity: 1;
          filter: blur(0) saturate(1) brightness(1);
          clip-path: inset(0 0 0 0 round 0);
        }
      }

      @keyframes premium-hero-glass-enter {
        from {
          opacity: .78;
          transform: translate3d(-18px, 0, 0);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
      }

      @keyframes premium-hero-copy-enter {
        from { opacity: .2; transform: translate3d(0, 16px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
      }

      @keyframes premium-hero-features-enter {
        from { opacity: .28; transform: translate3d(0, 22px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
      }

      @keyframes premium-hero-ambient-drift {
        from { transform: translate3d(-3%, -2%, 0) scale(.94); opacity: .11; }
        to { transform: translate3d(3%, 3%, 0) scale(1.08); opacity: .2; }
      }

      @keyframes premium-hero-image-drift {
        from { transform: scale(1.018) translate3d(-.35%, 0, 0); }
        to { transform: scale(1.052) translate3d(.45%, -.3%, 0); }
      }

      @keyframes premium-liquid-glint {
        0% { opacity: .08; transform: translate3d(-48%, 0, 0); }
        52% { opacity: .46; }
        100% { opacity: .14; transform: translate3d(48%, 0, 0); }
      }

      @keyframes premium-topdeal-image-enter {
        from { filter: saturate(.72) brightness(.72); clip-path: inset(0 0 0 10%); }
        to { filter: saturate(1) brightness(1); clip-path: inset(0 0 0 0); }
      }

      .premium-motion-ready .premium-hero-media-inner {
        animation: premium-hero-image-focus 1.08s var(--ease-out-expo) both;
      }

      .premium-motion-ready .premium-hero-image {
        animation: premium-hero-image-drift 18s ease-in-out 1.1s infinite alternate;
        will-change: transform;
      }

      .premium-motion-ready .premium-hero-glass {
        animation: premium-hero-glass-enter .76s var(--ease-out-expo) .08s both;
      }

      .premium-motion-ready .premium-hero-copy {
        animation: premium-hero-copy-enter .72s var(--ease-out-expo) .14s both;
      }

      .premium-motion-ready .premium-hero-features {
        animation: premium-hero-features-enter .78s var(--ease-out-expo) .28s both;
      }

      .premium-about-photos figure {
        transition: transform .58s var(--ease-out-expo), box-shadow .58s var(--ease-out-expo);
        will-change: transform;
      }

      .premium-about-photos:hover figure:first-child {
        transform: translate3d(-12px, -10px, 0) rotate(-6deg);
        box-shadow: 0 34px 70px rgba(15, 23, 42, .24);
      }

      .premium-about-photos:hover figure:last-child {
        transform: translate3d(-4px, 8px, 0) rotate(4deg);
        box-shadow: 0 34px 70px rgba(15, 23, 42, .24);
      }

      .premium-microsite-dark {
        --site-surface-elevated: #20242c;
        color-scheme: dark;
      }

      .premium-microsite-dark > header {
        border-color: var(--site-border) !important;
        background: color-mix(in srgb, var(--site-surface) 92%, transparent) !important;
        box-shadow: 0 14px 34px -28px rgba(0,0,0,.9);
      }

      .premium-microsite-dark section,
      .premium-microsite-dark footer {
        background: var(--site-bg) !important;
      }

      .premium-microsite-dark [class*="bg-white"],
      .premium-microsite-dark .premium-card,
      .premium-microsite-dark details > div {
        background-color: var(--site-surface) !important;
      }

      .premium-microsite-dark .premium-liquid-panel {
        color: var(--site-text);
        border-color: rgba(255,255,255,.13);
        background:
          radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--site-accent) 13%, transparent), transparent 40%),
          linear-gradient(135deg, rgba(34,38,46,.78), rgba(22,25,31,.60)) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.16),
          inset 0 -1px 0 rgba(255,255,255,.05),
          0 28px 72px -38px rgba(0,0,0,.78);
      }

      .premium-microsite-dark [class*="bg-zinc-50"],
      .premium-microsite-dark [class*="bg-zinc-100"],
      .premium-microsite-dark [class*="bg-zinc-200"],
      .premium-microsite-dark [class*="bg-[#f8f6f1]"],
      .premium-microsite-dark [class*="bg-[#fffdf8]"],
      .premium-microsite-dark [class*="bg-[#f7f3ee]"],
      .premium-microsite-dark [class*="bg-[#efe8df]"] {
        background-color: var(--site-soft) !important;
      }

      .premium-microsite-dark [class*="text-zinc-950"],
      .premium-microsite-dark [class*="text-zinc-900"],
      .premium-microsite-dark [class*="text-zinc-800"] {
        color: var(--site-text) !important;
      }

      .premium-microsite-dark [class*="text-zinc-700"],
      .premium-microsite-dark [class*="text-zinc-600"],
      .premium-microsite-dark [class*="text-zinc-500"],
      .premium-microsite-dark [class*="text-zinc-400"] {
        color: var(--site-muted) !important;
      }

      .premium-microsite-dark [class*="border-zinc"],
      .premium-microsite-dark [class*="border-white/70"],
      .premium-microsite-dark [class*="border-white/75"],
      .premium-microsite-dark [class*="border-white/80"],
      .premium-microsite-dark [class*="border-white/85"] {
        border-color: var(--site-border) !important;
      }

      .premium-microsite-dark .premium-branded-image {
        background:
          radial-gradient(circle at 18% 14%, color-mix(in srgb, var(--site-tertiary) 15%, transparent), transparent 36%),
          radial-gradient(circle at 82% 84%, color-mix(in srgb, var(--site-accent) 12%, transparent), transparent 40%),
          linear-gradient(145deg, var(--site-surface-elevated), var(--site-surface));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
      }

      .premium-microsite-dark .premium-about-scrim {
        background: linear-gradient(180deg,rgba(24,27,33,.76) 0%,rgba(24,27,33,.9) 54%,rgba(24,27,33,.97) 100%) !important;
      }

      .premium-microsite-dark .premium-about-background {
        filter: saturate(.78) brightness(.72);
      }

      .premium-microsite-dark .premium-about-photos figure {
        background: var(--site-surface-elevated) !important;
        box-shadow: 0 24px 52px rgba(0,0,0,.42);
      }

      .premium-microsite-dark .premium-hero-glass {
        background: linear-gradient(90deg, rgba(16,18,22,.90), rgba(16,18,22,.68) 78%, rgba(16,18,22,.52) 84%, rgba(16,18,22,.30) 90%, rgba(16,18,22,.12) 95%, transparent 100%);
      }

      .premium-microsite-dark .premium-feature-row {
        color: var(--site-text);
        border-color: var(--site-border) !important;
        background: color-mix(in srgb, var(--site-surface) 72%, transparent) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.11),
          inset 0 -1px 0 rgba(255,255,255,.04),
          0 26px 58px -34px rgba(0,0,0,.88);
      }

      .premium-microsite-dark .premium-feature-row::before {
        background: linear-gradient(155deg, rgba(255,255,255,.08), transparent 40%, rgba(255,255,255,.025) 72%, rgba(255,255,255,.06));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
      }

      .premium-microsite-dark .premium-liquid-panel::before {
        opacity: .32;
      }

      .premium-microsite-dark .premium-hero-service-icon {
        color: color-mix(in srgb, var(--site-accent) 72%, white);
        border-color: rgba(255,255,255,.12);
        background: rgba(255,255,255,.08);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 10px 24px -18px rgba(0,0,0,.9);
      }

      .premium-microsite-dark .premium-hero-service-label {
        color: #fffdf8;
        text-shadow: 0 1px 8px rgba(0,0,0,.38);
      }

      .premium-microsite-dark .premium-hero-service-description {
        color: #e7e1d8;
      }

      .premium-microsite-dark .premium-hero-secondary {
        color: var(--site-text) !important;
        border: 1px solid var(--site-border);
        background: var(--site-surface-elevated) !important;
        box-shadow: 0 14px 28px -20px rgba(0,0,0,.9);
      }

      .premium-microsite-dark .premium-stamp-panel {
        border: 1px solid var(--site-border);
        background: linear-gradient(145deg, rgba(32,36,44,.96), rgba(24,27,33,.94)) !important;
        box-shadow: 0 30px 76px -38px rgba(0,0,0,.9);
      }

      .premium-microsite-dark .premium-stamp-progress {
        color: var(--site-text) !important;
        background: color-mix(in srgb, var(--site-accent) 15%, var(--site-surface)) !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--site-accent) 22%, transparent);
      }

      .premium-microsite-dark .premium-stamp-circle {
        border-color: rgba(255,255,255,.16) !important;
        background: var(--site-surface-elevated) !important;
        color: var(--site-muted) !important;
      }

      .premium-microsite-dark .premium-stamp-circle[data-completed="true"] {
        border-color: #34d399 !important;
        background: color-mix(in srgb, #10b981 18%, var(--site-surface)) !important;
        color: #a7f3d0 !important;
      }

      .premium-microsite-dark .premium-stamp-circle[data-highlighted="true"] {
        border-color: var(--site-accent) !important;
        background: color-mix(in srgb, var(--site-accent) 18%, var(--site-surface)) !important;
        color: color-mix(in srgb, var(--site-accent) 72%, white) !important;
      }

      .premium-microsite-dark .premium-stamp-check,
      .premium-microsite-dark .premium-stamp-gift {
        border-color: var(--site-surface) !important;
      }

      .premium-microsite-dark .premium-stamp-gift {
        background: color-mix(in srgb, var(--site-accent) 18%, var(--site-surface)) !important;
      }

      .premium-microsite-dark .premium-stamp-circle[data-completed="true"] .premium-stamp-gift {
        background: var(--site-accent) !important;
        color: white !important;
      }

      .premium-microsite-dark .premium-stamp-reward {
        border-color: var(--site-border) !important;
        background: var(--site-surface-elevated) !important;
        box-shadow: 0 18px 38px -24px rgba(0,0,0,.88);
      }

      .premium-microsite-dark .premium-stamp-reward[data-current-reward="true"] {
        border-color: var(--site-accent) !important;
      }

      .premium-microsite-dark .premium-stamp-reward-icon {
        border-color: var(--site-border) !important;
        background: color-mix(in srgb, var(--site-accent) 12%, var(--site-surface)) !important;
      }

      .premium-microsite-dark .premium-app-screen [class*="bg-white"] {
        background-color: white !important;
      }

      .premium-microsite-dark .premium-qr-surface {
        background: white !important;
      }

      .premium-microsite-dark #partner-zitat {
        color: var(--site-text) !important;
      }

      .premium-microsite-dark #partner-zitat p {
        color: var(--site-muted) !important;
      }

      .premium-microsite-dark iframe {
        filter: saturate(.85) brightness(.78) contrast(1.05);
      }

      @container (max-width: 639px) {
        .premium-microsite-dark .premium-hero-title-panel {
          border-color: rgba(255,255,255,.12);
          background:
            radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--site-accent) 13%, transparent), transparent 48%),
            linear-gradient(145deg, rgba(32,36,44,.96), rgba(24,27,33,.9));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 20px 44px -30px rgba(0,0,0,.92);
        }
      }

      @container (min-width: 900px) {
        .premium-microsite-dark .premium-about-scrim {
          background: linear-gradient(90deg,#181b21 0%,#181b21 42%,rgba(24,27,33,.84) 56%,rgba(24,27,33,.24) 76%,rgba(24,27,33,0) 100%) !important;
        }

        .premium-microsite-dark .premium-about-background {
          filter: saturate(.82) brightness(.78);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .premium-microsite *,
        .premium-microsite *::before,
        .premium-microsite *::after {
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: .01ms !important;
        }

        .premium-parallax,
        .premium-hero-media-inner,
        .premium-hero-glass,
        .premium-hero-copy,
        .premium-hero-features,
        .premium-about-photos figure {
          transform: none !important;
        }

      }
    `}</style>
  )
}

function PremiumMotionEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".premium-microsite")

    if (!root) {
      return
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reducedMotion) {
      root.classList.add("premium-reduced-motion")
      return
    }

    root.classList.add("premium-motion-ready")

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
            revealObserver.unobserve(entry.target)
          }
        })
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    )

    const revealVisibleViewportElements = () => {
      const viewportHeight = window.innerHeight || 900

      revealElements.forEach((element) => {
        const rect = element.getBoundingClientRect()

        if (rect.top < viewportHeight * 0.94 && rect.bottom > 0) {
          element.classList.add("is-visible")
          revealObserver.unobserve(element)
        }
      })
    }

    revealElements.forEach((element, index) => {
      element.style.setProperty("--reveal-index", String(index % 5))
      element.classList.add("premium-reveal-pending")
      revealObserver.observe(element)
    })

    let frame = 0
    const updateParallax = () => {
      frame = 0
      const viewportHeight = window.innerHeight || 900

      parallaxElements.forEach((element) => {
        const rect = element.getBoundingClientRect()

        if (rect.bottom < -120 || rect.top > viewportHeight + 120) return

        const centerOffset = rect.top + rect.height / 2 - viewportHeight / 2
        const isHeroMedia = element.dataset.parallaxStrength === "strong"
        const strength = isHeroMedia ? -0.018 : -0.038
        const limit = isHeroMedia ? 14 : 54
        const y = Math.max(-limit, Math.min(limit, centerOffset * strength))
        element.style.setProperty("--parallax-y", `${y.toFixed(1)}px`)
      })
    }
    const requestParallaxUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax)
    }

    window.addEventListener("scroll", requestParallaxUpdate, { passive: true })
    window.addEventListener("resize", requestParallaxUpdate)

    revealVisibleViewportElements()
    window.requestAnimationFrame(revealVisibleViewportElements)
    window.requestAnimationFrame(updateParallax)

    return () => {
      revealObserver.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", requestParallaxUpdate)
      window.removeEventListener("resize", requestParallaxUpdate)
      root.classList.remove("premium-motion-ready")
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
  theme: ReturnType<typeof restaurantTheme>
}) {
  const navStyle = config.elementStyles["navigation.group"] ?? {}
  const [menuOpen, setMenuOpen] = useState(false)
  const navLinks = config.navigation.links

  return (
    <header
      {...editable("navigation.group", "group", "Top-Navigation")}
      className={`sticky top-0 z-40 flex items-center border-b px-4 py-3 backdrop-blur-xl @min-[640px]:px-6 @min-[1024px]:px-8 @min-[1180px]:py-4 ${theme.header}`}
      style={{
        minHeight: navStyle.height ? `${navStyle.height}px` : undefined,
        ...spacingStyleFor(config, "navigation.group"),
      }}
    >
      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 @min-[1180px]:grid-cols-[auto_minmax(0,1fr)_auto] @min-[1180px]:gap-8">
        <div className="flex min-w-0 items-center gap-3 overflow-visible">
          <BrandMark
            src={config.branding.logoUrl || partner.logo_url}
            editableId="branding.logo"
            style={imageStyleFor(config, "branding.logo")}
            size="nav"
          />
          <div className="block min-w-0 flex-1 overflow-hidden @min-[640px]:max-w-72">
            <p
              {...editable("branding.partnerName", "text", "Partnername")}
              className="w-full max-w-full truncate text-sm font-black tracking-[-0.03em] text-zinc-950 @min-[640px]:text-base"
              style={textStyleFor(config, "branding.partnerName")}
            >
              {textValue(config, "branding.partnerName", partner.name || config.hero.headline)}
            </p>
          </div>
        </div>
        <nav
          className="hidden min-w-0 items-center justify-end gap-0.5 text-sm font-bold text-zinc-800 @min-[1180px]:flex @min-[1320px]:gap-1 @min-[1320px]:text-[15px]"
          style={navigationTabsStyleFor(config)}
        >
          {navLinks.map((link) => (
            <NavigationLink key={link.anchor} link={link} config={config} />
          ))}
        </nav>
        <div className="hidden items-center gap-3 @min-[1180px]:flex">
          <a
            href="#deals"
            className="premium-button group inline-flex min-h-11 items-center justify-center gap-3 rounded-xl bg-[var(--site-accent)] px-5 py-3 text-sm font-black text-white shadow-[0_16px_30px_-18px_var(--site-accent)] transition duration-300 hover:-translate-y-0.5 hover:brightness-105"
          >
            {config.hero.primaryButtonLabel}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
          </a>
        </div>
        <div className="relative z-10 flex shrink-0 items-center justify-end gap-1.5 @min-[1180px]:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className={`premium-button grid size-11 shrink-0 place-items-center rounded-xl transition ${theme.mobileButton}`}
            aria-expanded={menuOpen}
            aria-controls="microsite-mobile-navigation"
            aria-label={config.language === "en" ? "Open navigation" : "Navigation öffnen"}
          >
            <MenuIcon className="size-6" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        {menuOpen ? (
          <nav
            id="microsite-mobile-navigation"
            className={`absolute right-0 top-[calc(100%+.65rem)] z-50 grid w-[min(88cqw,330px)] gap-1 rounded-2xl border p-2 text-sm font-bold @min-[1180px]:hidden ${theme.mobilePanel}`}
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
          ? "rounded-xl px-3 py-2.5 text-[15px] transition hover:bg-zinc-50 hover:text-[var(--site-accent)]"
          : "premium-nav-link whitespace-nowrap rounded-lg px-2.5 py-2 leading-none transition duration-300 hover:text-[var(--site-accent)] active:translate-y-px @min-[1320px]:px-3"
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
  void template
  const featureDescriptions = [
    "Schnell und unkompliziert für deinen Besuch.",
    "Sorgfältig ausgewählt und persönlich.",
    "Einfach, sicher und bequem.",
    "Herzlich willkommen – für alle.",
  ]

  return (
    <section className="relative bg-[var(--site-bg)]">
      <div className="premium-hero-stage relative mx-auto w-full min-w-0 max-w-7xl overflow-visible bg-[var(--site-bg)] @min-[640px]:min-h-[600px] @min-[1024px]:min-h-[600px]">
        <div className="premium-hero-media-inner absolute inset-0 overflow-hidden bg-[var(--site-secondary)]">
            <BrandedImage
              src={config.hero.backgroundImageUrl}
              alt={siteCopy(config, "Titelbild des Partners", "Partner cover image")}
              editableId="hero.backgroundImageUrl"
              editableLabel="Startbild"
              priority
              className="premium-hero-image absolute inset-0 h-full w-full object-cover [object-position:58%_center] @min-[640px]:[object-position:60%_center] @min-[1024px]:[object-position:center_center]"
            />
        </div>

        <div aria-hidden="true" className="premium-hero-glass pointer-events-none z-[1]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,251,247,.02)_0%,transparent_56%,rgba(255,247,239,.08)_78%,rgba(255,250,246,.42)_100%)]" />
        <span aria-hidden="true" className="premium-hero-ambient" />

        <div className="premium-hero-badge absolute z-10">
          <Badge config={config} />
        </div>

        <div className="premium-hero-flow z-10">
        <div className="premium-hero-content premium-hero-copy relative">
          <div className="premium-hero-title-panel">
          <h1
            {...editable("hero.headline", "text", "Startbereich Überschrift")}
            className="max-w-[18ch] whitespace-pre-line text-[clamp(1.75rem,7.8cqw,2.3rem)] font-black leading-[.98] tracking-[-0.04em] text-zinc-950 [text-wrap:balance] @min-[640px]:max-w-[11ch] @min-[640px]:text-[clamp(3rem,6.3cqw,4rem)] @min-[1024px]:text-[clamp(3rem,4.7cqw,4rem)]"
            style={textStyleFor(config, "hero.headline")}
          >
            {config.hero.headline}
          </h1>
          <p
            {...editable("hero.slogan", "text", "Startbereich Slogan")}
            className="mt-4 max-w-[31ch] break-words text-[clamp(1rem,1.65cqw,1.3rem)] font-medium italic leading-[1.45] text-[var(--site-accent)]"
            style={textStyleFor(config, "hero.slogan")}
          >
            {config.hero.slogan}
          </p>
          </div>

          <div className="mt-6 grid gap-3 text-[13px] font-semibold text-zinc-800 @min-[640px]:mt-7 @min-[640px]:text-sm @min-[1024px]:mt-8">
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

          <div className="mt-6 flex flex-col gap-2.5 @min-[520px]:flex-row @min-[1024px]:gap-3">
            <HeroButton id="hero.primaryButtonLabel" primary label={config.hero.primaryButtonLabel} config={config} />
            <HeroButton id="hero.secondaryButtonLabel" label={config.hero.secondaryButtonLabel} config={config} />
          </div>
        </div>

        <div className="premium-feature-row premium-hero-features relative z-20 mx-4 grid min-h-[140px] grid-cols-2 overflow-hidden rounded-[1.5rem] border border-white/70 px-2 py-2 @min-[640px]:mx-6 @min-[640px]:min-h-[106px] @min-[640px]:grid-cols-4 @min-[640px]:rounded-[1.5rem] @min-[640px]:px-2 @min-[640px]:py-2 @min-[1024px]:mx-10 @min-[1024px]:min-h-[106px] @min-[1024px]:px-3">
          {config.hero.services.slice(0, 4).map((service, index) => (
            <div
              key={`${service.label}-${index}`}
              className="flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 px-2 py-1.5 text-center @min-[640px]:min-h-0 @min-[640px]:gap-1.5 @min-[640px]:border-r @min-[640px]:border-white/55 @min-[640px]:px-3 @min-[640px]:last:border-r-0 @min-[1024px]:px-5"
            >
              <ServiceIcon
                id={`hero.services.${index}.icon`}
                name={service.icon}
                config={config}
                className="premium-hero-service-icon grid size-8 shrink-0 place-items-center rounded-[10px]"
              />
              <div className="min-w-0">
                <p
                  {...editable(`hero.services.${index}.label`, "text", `Service ${index + 1}`)}
                  className="premium-hero-service-label premium-no-text-reveal text-[11px] font-black leading-tight @min-[640px]:text-[13px]"
                  style={textStyleFor(config, `hero.services.${index}.label`)}
                >
                  {service.label}
                </p>
                <p
                  {...editable(`hero.services.${index}.description`, "text", `Service Beschreibung ${index + 1}`)}
                  className="premium-hero-service-description premium-no-text-reveal mt-1 hidden text-[10px] leading-4 @min-[640px]:block @min-[1024px]:text-[11px]"
                >
                  {textValue(config, `hero.services.${index}.description`, featureDescriptions[index] || featureDescriptions[0])}
                </p>
              </div>
            </div>
          ))}
        </div>
        </div>

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
  const publicDeals = getMicrositePublicDeals(partner.deals)
  const welcomeDeals = getMicrositeWelcomeDeals(partner.deals)
  const stampDeals = getMicrositeStampDeals(partner.deals)
  const stampRewards = getMicrositeStampRewards(partner.reward_milestones)
  const stampCount = Math.max(
    10,
    ...stampRewards
      .map((milestone) => milestone.required_stamps || 0)
      .filter(Boolean),
  )
  const visibleRewardStamps = Array.from(
    new Set(
      stampRewards
        .map((milestone) => milestone.required_stamps || 0)
        .filter((stamp) => stamp > 0 && stamp <= stampCount),
    ),
  )
  const topDealRef = useRef<HTMLDivElement | null>(null)
  const [activeStamp, setActiveStamp] = useState(0)
  const [topDealActive, setTopDealActive] = useState(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const reducedMotionFrame = window.requestAnimationFrame(() => {
        setActiveStamp(stampCount)
      })
      return () => window.cancelAnimationFrame(reducedMotionFrame)
    }

    let stepTimer = 0

    const playStampSequence = () => {
      setActiveStamp(0)

      let nextStamp = 1
      const advanceStamp = () => {
        setActiveStamp(nextStamp)
        nextStamp += 1
        if (nextStamp <= stampCount) {
          const progress = (nextStamp - 1) / Math.max(1, stampCount - 1)
          const nextDelay = Math.round(437 - progress * 260)
          stepTimer = window.setTimeout(advanceStamp, nextDelay)
        } else {
          stepTimer = window.setTimeout(playStampSequence, 3070)
        }
      }

      stepTimer = window.setTimeout(advanceStamp, 520)
    }

    stepTimer = window.setTimeout(playStampSequence, 212)

    return () => {
      if (stepTimer) window.clearTimeout(stepTimer)
    }
  }, [stampCount])

  useEffect(() => {
    const banner = topDealRef.current
    if (!banner || !publicDeals.length) return

    let frame = 0
    const updateBannerState = () => {
      frame = 0
      const bounds = banner.getBoundingClientRect()
      const isVisible = bounds.bottom > 0 && bounds.top < window.innerHeight
      setTopDealActive((current) => (current === isVisible ? current : isVisible))
    }
    const requestBannerUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateBannerState)
    }

    frame = window.requestAnimationFrame(updateBannerState)
    document.addEventListener("scroll", requestBannerUpdate, true)
    window.addEventListener("resize", requestBannerUpdate)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.removeEventListener("scroll", requestBannerUpdate, true)
      window.removeEventListener("resize", requestBannerUpdate)
    }
  }, [publicDeals.length])
  const stampMilestoneCards = [
    ...welcomeDeals.map((deal, index) => {
      const title = micrositeWelcomeTitle(deal, config.language)
      return {
        id: `welcome-${deal.id || index}`,
        stamp: Math.min(stampCount, micrositeWelcomeStampCount(deal)),
        eyebrow: "Willkommensbonus",
        titleId: "stamps.welcomeBonus.title",
        titleFallback: title,
        textId: "stamps.welcomeBonus.text",
        textFallback: micrositeDealDescription(deal, config.language),
        imageId: null,
        imageUrl: null,
        iconName: micrositeRewardIconName(title),
        tone: "emerald" as const,
      }
    }),
    ...stampDeals.map((deal, index) => {
      const title = micrositeDealTitle(deal, config.language)

      return {
        id: `stamp-deal-${deal.id || index}`,
        stamp: null,
        eyebrow: micrositeDealTypeLabel(deal, config.language),
        titleId: "stamps.automaticBonus.title",
        titleFallback: title,
        textId: "stamps.automaticBonus.text",
        textFallback: micrositeDealDescription(deal, config.language),
        imageId: null,
        imageUrl: null,
        iconName: micrositeRewardIconName(title),
        tone: "emerald" as const,
      }
    }),
    ...stampRewards.map((milestone, index) => {
      const stamp = milestone.required_stamps || 1
      const title = micrositeStampRewardTitle(milestone, config.language)
      const trackLabel = micrositeRewardTrackLabel(milestone, config.language)

      return {
        id: `reward-${milestone.id || stamp}-${index}`,
        stamp,
        eyebrow: `${stamp} Stempel${trackLabel ? ` · ${trackLabel}` : ""}`,
        titleId: `stamps.reward.${stamp}.label`,
        titleFallback: title,
        textId: `stamps.reward.${stamp}.description`,
        textFallback: micrositeStampRewardDescription(milestone, config.language),
        imageId: `stamps.reward.${stamp}.image`,
        imageUrl: textValue(
          config,
          `stamps.reward.${stamp}.image`,
          rewardImageForStamp(partner, config, milestone),
        ),
        iconName: micrositeRewardIconName(title),
        tone: "amber" as const,
      }
    }),
  ]
  return (
    <section id="deals" className={`${restaurantSectionClass(template, "deals")} scroll-mt-24 px-5 pb-10 @min-[640px]:px-8 @min-[1024px]:px-10`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 @min-[900px]:gap-10">
        <div className="premium-reveal pb-2 pt-12 @min-[640px]:pt-16">
          <div className="max-w-3xl">
            <h2
              {...editable("deals.headline", "text", "Deals Überschrift")}
              className="text-[clamp(2rem,4.8cqw,3.3rem)] font-black leading-[1.04] tracking-[-0.04em]"
              style={textStyleFor(config, "deals.headline")}
            >
              {config.deals.headline}
            </h2>
            <p
              {...editable("deals.slogan", "text", "Deals Slogan")}
              className="mt-4 text-[clamp(1.3rem,2.7cqw,1.9rem)] italic text-[var(--site-accent)]"
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
          </div>
        </div>

        {publicDeals.length ? (
          <div
            ref={topDealRef}
            className={`grid gap-5 ${publicDeals.length > 1 ? "@min-[900px]:grid-cols-2" : ""}`}
          >
            {publicDeals.map((deal, index) => (
              <MicrositeDealBanner
                key={deal.id || `deal-${index}`}
                deal={deal}
                config={config}
                active={topDealActive}
                primary={isMicrositeTopDeal(deal)}
                wide={publicDeals.length > 1 && isMicrositeTopDeal(deal)}
              />
            ))}
          </div>
        ) : null}

        <div
          id="stempelkarte"
          className="premium-stamp-story relative scroll-mt-24"
        >
          <div
            className="premium-stamp-panel rounded-[1.6rem] bg-white/94 p-5 shadow-[0_24px_64px_rgba(15,23,42,.10)] @min-[640px]:p-7"
          >
          <div className="premium-reveal grid gap-8 @min-[1024px]:grid-cols-[250px_1fr]">
            <div>
              <h3
                {...editable("stamps.headline", "text", "Stempelkarte Überschrift")}
                className="text-2xl font-bold leading-tight tracking-[-0.04em]"
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
              <p className="premium-stamp-progress premium-no-text-reveal mt-4 inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--site-tertiary)_14%,white)] px-3 py-1.5 text-xs font-black text-[var(--site-secondary)]" aria-live="polite">
                <span className="tabular-nums">{activeStamp}/{stampCount}</span>
                <span>{config.language === "en" ? "stamps completed" : "Stempel geschafft"}</span>
              </p>
            </div>
            <div>
              <div className="relative pt-1">
                <div className="absolute left-5 right-5 top-6 hidden h-px bg-zinc-200 @min-[640px]:block" />
                <div
                  className="absolute left-5 top-6 hidden h-px max-w-[calc(100%_-_2.5rem)] bg-[linear-gradient(90deg,#10b981,var(--site-tertiary),var(--site-accent))] transition-[width] duration-300 ease-out @min-[640px]:block"
                  style={{ width: `${(activeStamp / stampCount) * 100}%` }}
                />
                <div
                  className="relative z-[1] grid grid-cols-5 gap-x-2 gap-y-4 @min-[640px]:grid-cols-[repeat(var(--stamp-count),minmax(42px,1fr))]"
                  style={{ "--stamp-count": stampCount } as CSSProperties}
                >
                  {Array.from({ length: stampCount }, (_, index) => {
                    const number = index + 1
                    const highlighted = visibleRewardStamps.includes(number)
                    const completed = number <= activeStamp
                    const current = number === activeStamp
                    return (
                      <div key={number} className="relative flex w-full flex-col items-center">
                        {number < stampCount && number % 5 !== 0 ? (
                          <>
                            <span aria-hidden="true" className="absolute left-1/2 top-5 z-0 h-px w-[calc(100%+0.5rem)] bg-zinc-200 @min-[640px]:hidden" />
                            <span
                              aria-hidden="true"
                              className={`absolute left-1/2 top-5 z-[1] h-px w-[calc(100%+0.5rem)] origin-left bg-[linear-gradient(90deg,#10b981,var(--site-tertiary),var(--site-accent))] transition-transform duration-300 @min-[640px]:hidden ${
                                number < activeStamp ? "scale-x-100" : "scale-x-0"
                              }`}
                            />
                          </>
                        ) : null}
                        <span
                          data-stamp-number={number}
                          data-completed={completed}
                          data-highlighted={highlighted}
                          data-current={current}
                          className={`premium-stamp-circle relative z-[2] grid size-10 place-items-center rounded-full border bg-white text-sm font-semibold tabular-nums transition-[transform,background-color,border-color,color] duration-300 ${
                            completed
                              ? highlighted
                                ? "border-2 text-[var(--site-accent)] shadow-[0_10px_22px_-14px_var(--site-accent)]"
                                : "border-2 border-emerald-500 text-emerald-700 shadow-[0_8px_18px_-14px_#059669]"
                              : highlighted
                                ? "border-2 border-[var(--site-accent)] text-[var(--site-accent)]"
                                : "border-zinc-200 text-zinc-500"
                          } ${current ? "scale-110" : ""}`}
                        >
                          <span
                            {...editable(`stamps.number.${number}`, "text", `Stempel ${number}`)}
                            className="premium-stamp-number relative z-10 font-bold text-current"
                            style={textStyleFor(config, `stamps.number.${number}`)}
                          >
                            {textValue(config, `stamps.number.${number}`, String(number))}
                          </span>
                          {completed && !highlighted ? (
                            <span
                              aria-hidden="true"
                              className="premium-stamp-check pointer-events-none absolute -right-1 -top-1 z-20 grid size-4 place-items-center rounded-full border-2 border-white bg-emerald-500 text-white shadow-[0_4px_10px_-4px_rgba(5,150,105,.8)]"
                            >
                              <Check className="size-2.5" />
                            </span>
                          ) : null}
                          {highlighted ? (
                            <span
                              aria-hidden="true"
                              className={`premium-stamp-gift pointer-events-none absolute -bottom-1 -right-1 z-20 grid size-[18px] place-items-center rounded-full border-2 border-white shadow-[0_4px_10px_-4px_rgba(120,72,0,.65)] ${
                                completed
                                  ? "bg-[var(--site-accent)] text-white"
                                  : "bg-[color-mix(in_srgb,var(--site-accent)_12%,white)] text-[var(--site-accent)]"
                              }`}
                            >
                              <Gift className="size-2.5" strokeWidth={2.5} />
                            </span>
                          ) : null}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="premium-stamp-rewards mt-5 grid grid-cols-1 gap-3 @min-[640px]:mt-7 @min-[640px]:grid-cols-2 @min-[900px]:grid-cols-3">
                {stampMilestoneCards.map((card) => {
                  const unlocked = card.stamp === null || activeStamp >= card.stamp

                  return (
                    <div
                      key={card.id}
                      data-reward-stamp={card.stamp ?? undefined}
                      data-current-reward={card.stamp !== null && activeStamp === card.stamp}
                      className={`premium-stamp-reward relative flex min-h-[104px] w-full items-center gap-3 rounded-[1rem] border bg-white px-3 py-3 shadow-[0_14px_28px_rgba(120,72,0,.07)] transition-[opacity,transform,box-shadow,border-color] duration-300 ${
                        card.tone === "emerald"
                          ? "border-emerald-200"
                          : "border-amber-200"
                      } ${
                        unlocked
                          ? "opacity-100"
                          : "opacity-65"
                      } ${
                        activeStamp === card.stamp
                          ? "-translate-y-1 border-[var(--site-accent)] shadow-[0_20px_42px_-16px_var(--site-accent)]"
                          : ""
                      }`}
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
                        id={card.id.startsWith("welcome-") ? "stamps.welcomeBonus.icon" : `stamps.reward.${card.stamp}.icon`}
                        name={card.iconName}
                        config={config}
                        label={card.id.startsWith("welcome-") ? "Willkommensbonus Icon" : `${card.eyebrow} Icon`}
                        className={`premium-stamp-reward-icon grid size-12 shrink-0 place-items-center rounded-xl border shadow-sm ${
                          card.tone === "emerald"
                            ? "premium-stamp-welcome-icon border-emerald-200 bg-emerald-50 text-emerald-600"
                            : "border-amber-200 bg-amber-50 text-[var(--site-accent)]"
                        }`}
                        iconClassName={card.id.startsWith("welcome-") ? "size-7" : "size-6"}
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
                        className={`mt-1 font-black leading-tight tracking-[-0.035em] text-zinc-950 ${
                          card.tone === "emerald" ? "text-[13px]" : "text-[15px]"
                        }`}
                        style={textStyleFor(config, card.titleId)}
                      >
                        {card.titleFallback}
                      </p>
                      {card.textFallback ? (
                        <p
                          className="mt-1 text-[11px] leading-4 text-zinc-500"
                          style={textStyleFor(config, card.textId)}
                        >
                          {card.textFallback}
                        </p>
                      ) : null}
                    </div>
                    </div>
                  )
                })}
              </div>

              <p
                {...editable("stamps.description", "text", "Stempelkarte Hinweis")}
                className="mt-7 hidden text-xs text-zinc-500 @min-[640px]:block"
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
        </div>

        <BenefitsEcosystemSection partner={partner} config={config} />
      </div>
    </section>
  )
}

function MicrositeDealBanner({
  deal,
  config,
  active,
  primary = false,
  wide = false,
}: {
  deal: Deal
  config: MicrositeConfig
  active: boolean
  primary?: boolean
  wide?: boolean
}) {
  const isTopDeal = isMicrositeTopDeal(deal)
  const title = micrositeDealTitle(deal, config.language)
  const description = micrositeDealDescription(deal, config.language)
  const details = micrositeDealDetails(deal, config.language)
  const dealLabel = micrositeDealTypeLabel(deal, config.language)
  const articleClassName = isTopDeal
    ? `premium-topdeal relative min-h-full overflow-hidden rounded-[1.6rem] bg-[#121212] text-white shadow-[0_30px_80px_rgba(15,23,42,.22)] ${wide ? "@min-[900px]:col-span-2" : ""} ${active ? "is-active" : ""}`
    : `premium-reveal premium-deal-secondary relative min-h-full overflow-hidden rounded-[1.15rem] border border-[var(--site-border)] bg-[var(--site-surface)] text-[var(--site-text)] shadow-[0_16px_36px_rgba(15,23,42,.08)] ${active ? "is-active" : ""}`

  return (
    <article className={articleClassName}>
      {isTopDeal ? (
        <>
          <BrandedImage
            src={config.deals.topDealImageUrl}
            alt={`${title} – ${siteCopy(config, "Dealbild", "Deal image")}`}
            editableId={primary ? "deals.topDealImageUrl" : undefined}
            editableLabel="Deal Bild"
            className="premium-topdeal-image absolute inset-y-0 right-0 h-full w-full object-cover object-center @min-[640px]:w-[68%]"
            style={imageStyleFor(config, "deals.topDealImageUrl")}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#121212_0%,#121212_36%,rgba(18,18,18,.93)_43%,rgba(18,18,18,.16)_73%)]" />
          {primary ? (
            <span
              {...editable("deals.topDealImageUrl", "image", "Deal Bild")}
              aria-hidden="true"
              className="absolute inset-y-0 right-0 z-[20] min-w-[140px] w-[58%]"
            />
          ) : null}
        </>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-[var(--site-accent)]"
        />
      )}
      <div
        className={
          isTopDeal
            ? "relative z-[3] flex min-h-full flex-col p-5 @min-[640px]:p-7 @min-[1024px]:min-h-[310px] @min-[1024px]:p-8"
            : "relative z-[3] flex min-h-[132px] flex-col justify-center p-4 pl-5 @min-[640px]:min-h-[148px] @min-[640px]:p-5 @min-[640px]:pl-6"
        }
      >
        <p
          className={
            isTopDeal
              ? "inline-flex w-fit rounded-full border border-[var(--site-accent)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--site-accent)]"
              : "inline-flex w-fit rounded-full bg-[color-mix(in_srgb,var(--site-accent)_10%,transparent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--site-accent)]"
          }
        >
          {dealLabel}
        </p>
        <h3
          className={
            isTopDeal
              ? "mt-4 max-w-md text-[clamp(2.2rem,5cqw,3.5rem)] font-black leading-none tracking-[-0.04em]"
              : "mt-2 max-w-xl text-xl font-black leading-tight tracking-[-0.03em] @min-[640px]:text-2xl"
          }
        >
          {title}
        </h3>
        <p
          className={
            isTopDeal
              ? "mt-3 max-w-xl text-sm text-zinc-100"
              : "mt-2 max-w-2xl text-xs leading-5 text-[var(--site-muted)] @min-[640px]:text-sm"
          }
        >
          {description}
        </p>
        {details.length ? (
          <ul
            className={
              isTopDeal
                ? "mt-5 space-y-2 text-sm"
                : "mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--site-muted)]"
            }
          >
            {details.map((detail, index) => (
              <li
                key={`${detail}-${index}`}
                className="flex items-start gap-2"
              >
                {isTopDeal ? (
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_8px_18px_-10px_#10b981]">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="mt-[0.35rem] size-1.5 shrink-0 rounded-full bg-[var(--site-accent)]"
                  />
                )}
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          {...(primary ? editable("deals.topDealButtonLabel", "text", "Top-Deal Button") : {})}
          className={
            isTopDeal
              ? "premium-button premium-button-shine group mt-6 inline-flex min-h-11 w-fit items-center gap-3 rounded-lg bg-[var(--site-accent)] px-5 py-3 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
              : "premium-button group mt-4 inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-[var(--site-accent)] bg-transparent px-3.5 py-2 text-xs font-semibold text-[var(--site-accent)] transition duration-300 hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)] focus-visible:ring-offset-2"
          }
          style={isTopDeal ? textStyleFor(config, "deals.topDealButtonLabel") : undefined}
        >
          {config.deals.topDealButtonLabel}
          <ArrowRight
            className={`${isTopDeal ? "size-4" : "size-3.5"} transition-transform duration-300 group-hover:translate-x-1`}
            aria-hidden="true"
          />
        </button>
      </div>
    </article>
  )
}

function BenefitsEcosystemSection({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const appUrl = textValue(config, "content.appDownloadUrl", appDownloadUrlForPartner(partner))
  const screenshotUrl = textValue(
    config,
    "content.appPhoneScreenshotUrl",
    PARTNER_DETAIL_SCREEN_SRC,
  )
  const ecosystemKicker = textValue(
    config,
    "content.ecosystemKicker",
    siteCopy(config, "App-Vorteile", "App benefits"),
  )
  const compactKicker = /benefitsi/i.test(ecosystemKicker)
    ? siteCopy(config, "App-Vorteile", "App benefits")
    : ecosystemKicker
  const features = [
    {
      id: "deals.benefit.0",
      icon: "gift",
      title: siteCopy(config, "Exklusive Partner Deals", "Exclusive partner deals"),
      text: siteCopy(config, "Nur für Mitglieder", "Only for members"),
      featured: true,
    },
    {
      id: "deals.benefit.1",
      icon: "spark",
      title: siteCopy(config, "Einfach & automatisch", "Simple & automatic"),
      text: siteCopy(config, "Vorteile nutzen & sparen", "Use benefits and save"),
      featured: true,
    },
    {
      id: "content.ecosystem.badges",
      icon: "badge",
      title: siteCopy(config, "Badges freischalten", "Unlock badges"),
      text: siteCopy(config, "Erfolge sammeln und deinen Fortschritt sichtbar machen.", "Collect achievements and make your progress visible."),
    },
    {
      id: "content.ecosystem.streaks",
      icon: "flame",
      title: siteCopy(config, "Streaks aufbauen", "Build streaks"),
      text: siteCopy(config, "Regelmäßige Besuche werden mit neuen Meilensteinen belohnt.", "Regular visits unlock new milestones."),
    },
    {
      id: "content.ecosystem.drops",
      icon: "bell",
      title: siteCopy(config, "Deal Drops zuerst sehen", "See deal drops first"),
      text: siteCopy(config, "Neue, limitierte Vorteile landen direkt in deiner App.", "New limited benefits land directly in your app."),
    },
    {
      id: "content.ecosystem.favorites",
      icon: "heart",
      title: siteCopy(config, "Favoriten merken", "Save favorites"),
      text: siteCopy(config, "Lieblingspartner, Deals und Belohnungen immer griffbereit.", "Keep favorite partners, deals and rewards close at hand."),
    },
  ]

  return (
    <section id="app" className="premium-reveal relative scroll-mt-24 px-1 pb-2 pt-7 @min-[760px]:pt-9">
      <div className="mx-auto grid max-w-6xl items-end gap-4 @min-[760px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-w-2xl text-left">
          <p
            {...editable("content.ecosystemKicker", "text", "App Vorteile Label")}
            className="text-[10px] font-black uppercase tracking-[.15em] text-[var(--site-accent)]"
            style={textStyleFor(config, "content.ecosystemKicker")}
          >
            {compactKicker}
          </p>
          <h2
            {...editable("content.ecosystemHeadline", "text", "App Vorteile Überschrift")}
            className="mt-2 max-w-[18ch] text-[clamp(2rem,4cqw,3rem)] font-black leading-[.98] tracking-[-.05em] text-zinc-950 [text-wrap:balance]"
            style={textStyleFor(config, "content.ecosystemHeadline")}
          >
            {textValue(config, "content.ecosystemHeadline", siteCopy(config, "Mehr als nur Stempel.", "More than just stamps."))}
          </h2>
          <p
            {...editable("content.ecosystemText", "text", "App Vorteile Text")}
            className="mt-3 max-w-xl text-sm leading-6 text-zinc-600"
            style={textStyleFor(config, "content.ecosystemText")}
          >
            {textValue(
              config,
              "content.ecosystemText",
              siteCopy(
                config,
                "Deals, Treue und Belohnungen direkt in der App.",
                "Deals, loyalty and rewards directly in the app.",
              ),
            )}
          </p>
        </div>
        <AppExploreButton href={appUrl} config={config} />
      </div>

      <div className="mt-5 grid items-center gap-3 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(220px,.68fr)_minmax(0,1fr)] @min-[900px]:gap-4">
        <div className="order-2 grid min-w-0 grid-cols-3 gap-2 @min-[900px]:order-1 @min-[900px]:grid-cols-1">
          {features.slice(0, 3).map((feature, index) => (
            <EcosystemFeatureCard key={feature.id} feature={feature} index={index} config={config} />
          ))}
        </div>

        <div className="order-1 @min-[900px]:order-2">
          <AppScreenShowcase partner={partner} config={config} screenshotUrl={screenshotUrl} />
        </div>

        <div className="order-3 grid min-w-0 grid-cols-3 gap-2 @min-[900px]:grid-cols-1">
          {features.slice(3).map((feature, index) => (
            <EcosystemFeatureCard key={feature.id} feature={feature} index={index + 3} config={config} />
          ))}
        </div>
      </div>
    </section>
  )
}

function EcosystemFeatureCard({
  feature,
  index,
  config,
}: {
  feature: { id: string; icon: string; title: string; text: string }
  index: number
  config: MicrositeConfig
}) {
  return (
    <article className="premium-liquid-panel premium-ecosystem-card group min-w-0 overflow-hidden rounded-[1.1rem] p-2.5 @min-[560px]:p-3">
      <div className="flex items-start justify-between gap-3">
        <ThemeIcon
          id={`${feature.id}.icon`}
          name={textValue(config, `${feature.id}.icon`, feature.icon)}
          config={config}
          label={`${feature.title} Icon`}
          className="grid size-7 shrink-0 place-items-center rounded-[.7rem] bg-[color-mix(in_srgb,var(--site-accent)_10%,white)] text-[var(--site-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,.8)] transition duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-3deg] @min-[560px]:size-8"
          iconClassName="size-3.5 @min-[560px]:size-4"
        />
        <span className="text-sm font-black tabular-nums tracking-[-.06em] text-[color-mix(in_srgb,var(--site-accent)_34%,white)]">
          0{index + 1}
        </span>
      </div>
      <h3
        {...editable(`${feature.id}.title`, "text", feature.title)}
        className="mt-2 text-[11px] font-black leading-tight tracking-[-.025em] text-zinc-950 @min-[560px]:mt-2.5 @min-[560px]:text-sm"
        style={textStyleFor(config, `${feature.id}.title`)}
      >
        {textValue(config, `${feature.id}.title`, feature.title)}
      </h3>
      <p
        {...editable(`${feature.id}.text`, "text", feature.text)}
        className="mt-1 hidden text-[11px] leading-[1.45] text-zinc-600 @min-[560px]:block"
        style={textStyleFor(config, `${feature.id}.text`)}
      >
        {textValue(config, `${feature.id}.text`, feature.text)}
      </p>
    </article>
  )
}

function AppScreenShowcase({
  partner,
  config,
  screenshotUrl,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  screenshotUrl: string
}) {
  const partnerName = partner.short_name || partner.name || siteCopy(config, "Partner", "Partner")
  const partnerCategory =
    partner.category?.filter(Boolean).slice(0, 2).join(" · ") ||
    partner.type ||
    siteCopy(config, "Gastronomie", "Hospitality")
  const partnerDescription =
    partner.description ||
    siteCopy(
      config,
      "Entdecke diesen Benefitsi Partner, seine aktuellen Vorteile und die Speisekarte.",
      "Discover this Benefitsi partner, current benefits, and the menu.",
    )
  const activeDeals = partner.deals.filter((deal) => deal.active !== false)
  const activeDeal = activeDeals[0]
  const dealName = activeDeal
    ? micrositeDealTitle(activeDeal, config.language)
    : config.deals.topDealHeadline ||
      siteCopy(config, "2 für 1 Vorteil", "2-for-1 benefit")
  const dealDescription = activeDeal
    ? micrositeDealDescription(activeDeal, config.language)
    : config.deals.topDealDescription ||
      siteCopy(config, "Deinen Vorteil direkt in der App auswählen.", "Select your benefit directly in the app.")
  const savingsLabel = activeDeal?.estimated_savings
    ? siteCopy(config, "ca. " + formatPrice(activeDeal.estimated_savings, "EUR") + " sparen", "save about " + formatPrice(activeDeal.estimated_savings, "EUR"))
    : siteCopy(config, "Direkt sparen", "Save instantly")
  const stampTarget = Math.max(
    10,
    partner.stamp_target || 0,
    ...partner.reward_milestones.map((milestone) => milestone.required_stamps || 0),
  )
  const previewStamps = Math.min(4, Math.max(1, stampTarget - 1))
  const customPreview = screenshotUrl && screenshotUrl !== PARTNER_DETAIL_SCREEN_SRC ? screenshotUrl : null
  const heroImages = Array.from(
    new Set(
      [
        customPreview,
        ...(partner.cover_urls || []),
        partner.discover_card_image_url,
        partner.feature_card_url,
        screenshotUrl,
        PARTNER_DETAIL_SCREEN_SRC,
      ].filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 5)
  const menuItems = partner.menus
    .flatMap((menu) => [...menu.items, ...menu.categories.flatMap((category) => category.items)])
    .filter((item) => Boolean(item.name))
    .slice(0, 4)
  const openingHours = partner.opening_hours
    .filter((row) => row.is_closed !== true && row.opens_at && row.closes_at)
    .sort((first, second) => (first.weekday || 0) - (second.weekday || 0))
    .slice(0, 4)
  const weekdayLabels = config.language === "de"
    ? ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const fallbackMenuItems = [
    [siteCopy(config, "Lieblingsgericht", "Signature dish"), "12,90 €"],
    [siteCopy(config, "Hausgemachtes Getränk", "House drink"), "4,50 €"],
    [siteCopy(config, "Dessert des Hauses", "House dessert"), "6,90 €"],
  ] as const

  const [activeCover, setActiveCover] = useState(0)
  const [favorite, setFavorite] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dealSelected, setDealSelected] = useState(false)
  const [openingExpanded, setOpeningExpanded] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const phoneScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (heroImages.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const carouselTimer = window.setInterval(
      () => setActiveCover((current) => (current + 1) % heroImages.length),
      8400,
    )
    return () => window.clearInterval(carouselTimer)
  }, [heroImages.length])

  useEffect(() => {
    if (!toastMessage) return
    const toastTimer = window.setTimeout(() => setToastMessage(""), 1800)
    return () => window.clearTimeout(toastTimer)
  }, [toastMessage])

  const showPhoneToast = (german: string, english: string) => {
    setToastMessage(siteCopy(config, german, english))
  }

  return (
    <div className="relative mx-auto flex min-h-[520px] max-w-[330px] flex-col items-center justify-center px-4 py-3 @min-[900px]:min-h-[545px] @min-[900px]:px-2">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--site-accent)_16%,transparent)] blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border border-[color-mix(in_srgb,var(--site-accent)_16%,transparent)]" />

      <div className="premium-app-screen relative z-[1] w-[224px] rounded-[2.45rem] bg-[#070708] p-[6px] shadow-[0_34px_70px_-28px_rgba(20,18,16,.68),inset_0_0_0_1px_rgba(255,255,255,.15)] @min-[560px]:w-[232px] @min-[900px]:w-[240px]">
        <span className="absolute -left-[3px] top-24 h-12 w-[3px] rounded-l-full bg-[#202024]" aria-hidden="true" />
        <span className="absolute -left-[3px] top-40 h-9 w-[3px] rounded-l-full bg-[#202024]" aria-hidden="true" />
        <span className="absolute -right-[3px] top-32 h-16 w-[3px] rounded-r-full bg-[#202024]" aria-hidden="true" />

        <div className="relative aspect-[738/1600] overflow-hidden rounded-[2.08rem] bg-[#f6f7f9] text-[#172033] ring-1 ring-white/10">
          <span className="pointer-events-none absolute left-1/2 top-1.5 z-[30] h-[14px] w-[31%] -translate-x-1/2 rounded-full bg-[#070708]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[29] flex h-6 items-center justify-between px-3 pt-1 text-[7px] font-black text-white [text-shadow:0_1px_4px_rgba(0,0,0,.55)]">
            <span>09:41</span>
            <span className="tracking-[.08em]">● ◒ ▰</span>
          </div>

          <div ref={phoneScrollRef} className="premium-phone-scroll absolute inset-0 min-w-0 overflow-x-hidden overflow-y-auto bg-[#f6f7f9] pb-7">
            <div className="relative h-[176px] overflow-hidden bg-[#d8dee7]">
              <BrandedImage
                src={heroImages[activeCover] || PARTNER_DETAIL_SCREEN_SRC}
                alt={siteCopy(config, "Titelbild von " + partnerName, "Cover image for " + partnerName)}
                editableId="content.appPhoneScreenshotUrl"
                editableLabel="Partner-Titelbild im Telefon"
                className="absolute inset-0 h-full w-full object-cover"
                style={imageStyleFor(config, "content.appPhoneScreenshotUrl")}
              />
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,12,22,.28),transparent_42%,rgba(5,12,22,.35))]" />
              <button
                type="button"
                onClick={() => phoneScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                className="absolute left-2 top-7 z-[2] grid size-6 cursor-pointer place-items-center rounded-full bg-[#777]/80 text-white shadow-sm transition hover:bg-[#666]/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={siteCopy(config, "Zurück nach oben", "Back to top")}
              >
                <ChevronLeft className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
              </button>
              <span className="absolute right-2 top-7 z-[2] rounded-full bg-[#0a9fe1] px-2 py-1 text-[5.5px] font-black uppercase tracking-[.06em] text-white shadow-sm">
                {siteCopy(config, "Offen", "Open")}
              </span>
              {heroImages.length > 1 ? (
                <div className="absolute inset-x-0 bottom-2 z-[2] flex justify-center gap-1" aria-label={siteCopy(config, "Titelbilder", "Cover images")}>
                  {heroImages.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      onClick={() => setActiveCover(index)}
                      aria-label={siteCopy(config, "Bild " + (index + 1), "Image " + (index + 1))}
                      aria-pressed={activeCover === index}
                      className={"h-1.5 cursor-pointer rounded-full shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white " + (activeCover === index ? "w-3.5 bg-white" : "w-1.5 bg-white/55")}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="px-2.5 pb-4 pt-2.5">
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-black leading-[1.08] tracking-[-.035em] text-[#182136]">{partnerName}</h3>
                  <p className="mt-1 text-[7px] font-medium text-[#7a8492]">{partnerCategory}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFavorite((current) => !current)}
                  aria-label={favorite ? siteCopy(config, "Aus Favoriten entfernen", "Remove from favorites") : siteCopy(config, "Zu Favoriten hinzufügen", "Add to favorites")}
                  aria-pressed={favorite}
                  className={"grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border bg-white shadow-[0_3px_8px_rgba(20,29,43,.1)] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1] " + (favorite ? "border-[#ffccd5] bg-[#ee6686] text-white" : "border-[#e5e8ed] text-[#687486]")}
                >
                  <Heart className={"size-3 " + (favorite ? "fill-current" : "")} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => showPhoneToast("Teilen geöffnet", "Share opened")}
                  aria-label={siteCopy(config, "Partner teilen", "Share partner")}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border border-[#e5e8ed] bg-white text-[#687486] shadow-[0_3px_8px_rgba(20,29,43,.1)] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1]"
                >
                  <Share2 className="size-3" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#eaf8fb] px-1.5 text-[6px] font-black text-[#078d98]">
                  <Award className="size-2.5" aria-hidden="true" />
                  {siteCopy(config, "Neu hier", "New here")}
                </span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="premium-phone-compact-label inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border border-[#9adbe5] bg-white px-2 text-[#182136] transition hover:bg-[#f5fbfc] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1]"
                >
                  <Utensils className="size-2.5" aria-hidden="true" />
                  {siteCopy(config, "Speisekarte", "Menu")}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setDescriptionExpanded((current) => !current)}
                aria-expanded={descriptionExpanded}
                className="mt-3 flex w-full cursor-pointer items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1]"
              >
                <span className="text-[8px] font-black text-[#202a3c]">{siteCopy(config, "Beschreibung", "Description")}</span>
                <ChevronDown className={"size-3 text-[#718096] transition-transform " + (descriptionExpanded ? "rotate-180" : "")} aria-hidden="true" />
              </button>
              <p className={"mt-1 text-[6.5px] leading-[1.55] text-[#707b8a] " + (descriptionExpanded ? "" : "line-clamp-2")}>
                {partnerDescription}
              </p>

              <div className="mt-3.5 flex items-center gap-1.5">
                <h4 className="text-[10.5px] font-black tracking-[-.025em] text-[#152033]">{siteCopy(config, "Deine Vorteile", "Your benefits")}</h4>
                <Circle className="size-3 text-[#657184]" strokeWidth={2} aria-hidden="true" />
              </div>

              <div className="mt-2 rounded-[1rem] border border-[#e1e5eb] bg-white p-2.5 shadow-[0_5px_14px_rgba(23,32,51,.08)]">
                <div className="flex items-start gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dff2ff] text-[#0a9fe1]">
                    <Utensils className="size-4" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9.5px] font-black leading-tight text-[#202a3c]">{dealName}</span>
                    <span className="mt-1 inline-flex rounded-full bg-[#eef8ff] px-1.5 py-1 text-[5.5px] font-black text-[#078dcc]">{savingsLabel}</span>
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-[6.5px] leading-[1.45] text-[#687486]">{dealDescription}</p>
                <div className="mt-1.5 flex items-center justify-between text-[5.5px] font-semibold text-[#7a8492]">
                  <span>{siteCopy(config, "Bei jedem Besuch", "On every visit")}</span>
                  <button type="button" onClick={() => showPhoneToast("Vorteilsdetails geöffnet", "Benefit details opened")} className="cursor-pointer text-[5px] font-black text-[#078dcc] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13c5d1]">
                    {siteCopy(config, "Details", "Details")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setDealSelected((current) => !current)}
                  aria-pressed={dealSelected}
                  className={"premium-phone-compact-label mt-2 flex h-6 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1] " + (dealSelected ? "bg-[#e7faf5] text-[#087c68] ring-1 ring-[#9ee3d2]" : "bg-[linear-gradient(90deg,#13c5d1,#0a9fe1)] text-white")}
                >
                  {dealSelected ? <Check className="size-2.5" strokeWidth={2.8} aria-hidden="true" /> : null}
                  {dealSelected ? siteCopy(config, "Ausgewählt", "Selected") : siteCopy(config, "Vorteil auswählen", "Select benefit")}
                </button>
              </div>

              {activeDeals.length > 1 ? (
                <button type="button" onClick={() => showPhoneToast("Alle Vorteile angezeigt", "All benefits shown")} className="premium-phone-compact-label mt-1.5 w-full cursor-pointer py-1 text-center text-[#078dcc] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13c5d1]">
                  {siteCopy(config, "Alle Vorteile anzeigen", "Show all benefits")}
                </button>
              ) : null}

              <h4 className="mt-4 text-[10.5px] font-black tracking-[-.025em] text-[#152033]">{siteCopy(config, "Stempelkarte", "Stamp card")}</h4>
              <div className="mt-2 rounded-[1rem] border border-[#e1e5eb] bg-white p-2.5 shadow-[0_5px_14px_rgba(23,32,51,.07)]">
                <div className="flex items-end justify-between">
                  <span>
                    <span className="block text-[8px] font-black text-[#202a3c]">{previewStamps}/{stampTarget} {siteCopy(config, "Stempel", "stamps")}</span>
                    <span className="mt-0.5 block text-[5.5px] text-[#7b8696]">{siteCopy(config, "Weiter sammeln und Belohnung sichern", "Keep collecting toward your reward")}</span>
                  </span>
                  <BadgeCheck className="size-4 text-[#13aa92]" aria-hidden="true" />
                </div>
                <div className="mt-2 grid grid-cols-10 gap-1">
                  {Array.from({ length: Math.min(stampTarget, 10) }, (_, index) => (
                    <span key={index} className={"grid aspect-square place-items-center rounded-full border text-[5px] font-black tabular-nums " + (index < previewStamps ? "border-[#14aa91] bg-white text-[#087c68]" : "border-[#dce2e9] bg-white text-[#8792a1]")}>{index + 1}</span>
                  ))}
                </div>
                <button type="button" onClick={() => showPhoneToast("Scanner geöffnet", "Scanner opened")} className="premium-phone-compact-label mt-2 flex h-[26px] w-full cursor-pointer items-center justify-center gap-1 rounded-full bg-[#0a9fe1] text-white transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1]">
                  <QrCode className="size-2.5" aria-hidden="true" />
                  {siteCopy(config, "Stempel sammeln", "Collect stamps")}
                </button>
              </div>

              <h4 className="mt-4 text-[10.5px] font-black tracking-[-.025em] text-[#152033]">{siteCopy(config, "Deine Badges", "Your badges")}</h4>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {[
                  [Award, siteCopy(config, "Entdecker", "Explorer")],
                  [Flame, siteCopy(config, "Stammgast", "Regular")],
                  [Heart, siteCopy(config, "Favorit", "Favorite")],
                ].map(([Icon, label]) => {
                  const BadgeIcon = Icon as LucideIcon
                  return (
                    <button key={String(label)} type="button" onClick={() => showPhoneToast(String(label), String(label))} className="flex min-h-13 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-[#e4e8ee] bg-white px-1 text-center shadow-[0_4px_12px_rgba(23,32,51,.06)] transition active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1]">
                      <BadgeIcon className="size-3.5 text-[#0a9fe1]" aria-hidden="true" />
                      <span className="text-[5px] font-black text-[#4f5c6d]">{String(label)}</span>
                    </button>
                  )
                })}
              </div>

              <h4 className="mt-4 text-[10.5px] font-black tracking-[-.025em] text-[#152033]">{siteCopy(config, "Kontakt & Öffnungszeiten", "Contact & opening hours")}</h4>
              <div className="mt-2 overflow-hidden rounded-[1rem] border border-[#e1e5eb] bg-white shadow-[0_5px_14px_rgba(23,32,51,.08)]">
                <button type="button" onClick={() => showPhoneToast("Karte geöffnet", "Map opened")} className="relative block h-24 w-full cursor-pointer overflow-hidden bg-[#e9f0f2] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#13c5d1]">
                  <span className="absolute inset-0 opacity-55 [background-image:linear-gradient(28deg,transparent_46%,rgba(255,255,255,.9)_47%,rgba(255,255,255,.9)_52%,transparent_53%),linear-gradient(112deg,transparent_43%,rgba(255,255,255,.8)_44%,rgba(255,255,255,.8)_48%,transparent_49%)] [background-size:62px_42px,74px_58px]" />
                  <span className="absolute left-[54%] top-[43%] grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#0a9fe1] text-white shadow-[0_5px_12px_rgba(10,159,225,.35)]">
                    <MapPin className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="absolute inset-x-2 bottom-2 truncate rounded-md bg-white/90 px-2 py-1 text-[5px] font-black text-[#435064] shadow-sm backdrop-blur-sm">{partner.address || partner.city_name || siteCopy(config, "Standort", "Location")}</span>
                </button>
                <div className="space-y-2 p-2.5">
                  {partner.address ? (
                    <button type="button" onClick={() => showPhoneToast("Karten geöffnet", "Maps opened")} className="flex w-full cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13c5d1]">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eef8ff] text-[#0a9fe1]"><MapPin className="size-3.5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[5.75px] font-black text-[#354154]">{partner.address}</span><span className="block text-[4.5px] font-black uppercase tracking-[.05em] text-[#0a9fe1]">{siteCopy(config, "In Karten öffnen", "Open in maps")}</span></span>
                    </button>
                  ) : null}
                  {partner.phone ? (
                    <button type="button" onClick={() => showPhoneToast("Anruf vorbereitet", "Call prepared")} className="flex w-full cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13c5d1]">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eef8ff] text-[#0a9fe1]"><Phone className="size-3.5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[5.75px] font-black text-[#354154]">{partner.phone}</span><span className="block text-[4.5px] font-black uppercase tracking-[.05em] text-[#0a9fe1]">{siteCopy(config, "Jetzt anrufen", "Call now")}</span></span>
                    </button>
                  ) : null}
                  {partner.email ? (
                    <button type="button" onClick={() => showPhoneToast("E-Mail vorbereitet", "Email prepared")} className="flex w-full cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13c5d1]">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eef8ff] text-[#0a9fe1]"><Mail className="size-3.5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[5.75px] font-black text-[#354154]">{partner.email}</span><span className="block text-[4.5px] font-black uppercase tracking-[.05em] text-[#0a9fe1]">{siteCopy(config, "E-Mail senden", "Send email")}</span></span>
                    </button>
                  ) : null}
                  {partner.website ? (
                    <button type="button" onClick={() => showPhoneToast("Website geöffnet", "Website opened")} className="flex w-full cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13c5d1]">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eef8ff] text-[#0a9fe1]"><Globe2 className="size-3.5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[5.75px] font-black text-[#354154]">{partner.website.replace(/^https?:\/\//, "")}</span><span className="block text-[4.5px] font-black uppercase tracking-[.05em] text-[#0a9fe1]">{siteCopy(config, "Website öffnen", "Open website")}</span></span>
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setOpeningExpanded((current) => !current)} aria-expanded={openingExpanded} className="flex w-full cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13c5d1]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eef8ff] text-[#0a9fe1]"><Clock3 className="size-3.5" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[5.75px] font-black text-[#354154]">{siteCopy(config, "Öffnungszeiten", "Opening hours")}</span><span className="block truncate text-[4.5px] font-semibold text-[#7b8696]">{config.hero.openingText}</span></span>
                    <ChevronDown className={"size-3 text-[#788394] transition-transform " + (openingExpanded ? "rotate-180" : "")} aria-hidden="true" />
                  </button>
                  {openingExpanded ? (
                    <div className="rounded-lg bg-[#f6f8fa] px-2 py-1.5">
                      {(openingHours.length ? openingHours : [null]).map((row, index) => (
                        <div key={row?.id || index} className="flex items-center justify-between py-1 text-[5.5px] text-[#647084]">
                          <span className="font-black">{row ? weekdayLabels[row.weekday || 0] : siteCopy(config, "Heute", "Today")}</span>
                          <span>{row ? (row.label || row.opens_at + " – " + row.closes_at) : config.hero.openingText}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {menuOpen ? (
            <div className="absolute inset-0 z-[40] flex items-end bg-[#101826]/45 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={siteCopy(config, "Speisekarte", "Menu")}>
              <button type="button" onClick={() => setMenuOpen(false)} className="absolute inset-0 cursor-default" aria-label={siteCopy(config, "Speisekarte schließen", "Close menu")} />
              <div className="premium-phone-view relative z-[1] w-full rounded-t-[1.5rem] bg-[#f8fafc] px-3 pb-5 pt-2.5 shadow-[0_-16px_36px_rgba(20,29,43,.2)]">
                <span className="mx-auto block h-1 w-9 rounded-full bg-[#cbd3de]" aria-hidden="true" />
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black tracking-[-.03em]">{siteCopy(config, "Speisekarte", "Menu")}</p>
                    <p className="mt-0.5 text-[6px] text-[#7b8797]">{partnerName}</p>
                  </div>
                  <button type="button" onClick={() => setMenuOpen(false)} className="grid size-6 cursor-pointer place-items-center rounded-full bg-white text-[#4f5d70] shadow-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13c5d1]" aria-label={siteCopy(config, "Schließen", "Close")}>
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {(menuItems.length
                    ? menuItems.map((item) => [item.name || "", formatPrice(item.price ?? "", item.currency)] as const)
                    : fallbackMenuItems
                  ).map(([name, price], index) => (
                    <div key={name + index} className="flex min-h-10 items-center gap-2 rounded-xl border border-[#e8edf2] bg-white p-2 shadow-sm">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#fff5e8] text-[#f08d1c]"><Utensils className="size-3" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[7px] font-black text-[#202a3c]">{name}</span>
                        <span className="mt-0.5 block text-[5.5px] text-[#8993a1]">{siteCopy(config, "Direkt beim Partner erhältlich", "Available at the partner")}</span>
                      </span>
                      <span className="shrink-0 text-[6.5px] font-black text-[#f07818]">{price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {toastMessage ? (
            <div aria-live="polite" className="premium-phone-view absolute left-1/2 top-9 z-[50] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#172033]/92 px-2.5 py-1.5 text-[6.5px] font-black text-white shadow-lg backdrop-blur-md">
              <Check className="size-2.5 text-[#69e5c5]" strokeWidth={2.8} aria-hidden="true" />
              {toastMessage}
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-0 z-[60] bg-[linear-gradient(112deg,rgba(255,255,255,.1),transparent_20%,transparent_78%,rgba(255,255,255,.04))]" />
        </div>
      </div>
    </div>
  )
}
function AppExploreButton({ href, config }: { href: string; config: MicrositeConfig }) {
  return (
    <a
      href={href}
      className="premium-app-cta premium-button group inline-flex min-h-11 items-center justify-self-center gap-2 rounded-xl px-4 py-2.5 text-white transition duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.985] @min-[760px]:justify-self-end"
    >
      <span className="text-sm font-black leading-tight">
        {siteCopy(config, "Benefitsi App öffnen", "Open the Benefitsi app")}
      </span>
      <span className="grid size-7 place-items-center rounded-full bg-white/15 transition duration-300 group-hover:translate-x-1 group-hover:bg-white/24">
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </a>
  )
}

function StoreBadge({
  store,
  href,
  language = "de",
  compact = false,
}: {
  store: "app-store" | "google-play"
  href: string
  language?: MicrositeConfig["language"]
  compact?: boolean
}) {
  const isAppStore = store === "app-store"
  const english = language === "en"

  return (
    <a
      href={href}
      className={`inline-flex min-w-0 max-w-full items-center justify-center rounded-[0.8rem] bg-black text-white shadow-[0_12px_26px_rgba(15,23,42,.16)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-zinc-900 ${compact ? "w-full gap-1 px-1.5 py-1" : "w-full gap-3 px-4 py-3 @min-[420px]:w-auto @min-[420px]:min-w-[190px]"}`}
      aria-label={isAppStore ? (english ? "Download on the App Store" : "Laden im App Store") : (english ? "Get it on Google Play" : "Jetzt bei Google Play")}
    >
      {isAppStore ? (
        <AppleGlyph className={compact ? "size-6" : "size-8"} />
      ) : (
        <PlayGlyph className={compact ? "size-6" : "size-8"} />
      )}
      <span>
        <span className={`block font-semibold uppercase leading-none text-zinc-300 ${compact ? "text-[8px]" : "text-[10px]"}`}>
          {isAppStore
            ? english ? "Download on the" : "Laden im"
            : english ? "Get it on" : "Jetzt bei"}
        </span>
        <span className={`block font-black leading-tight ${compact ? "text-xs" : "text-[1.05rem]"}`}>
          {isAppStore ? "App Store" : "Google Play"}
        </span>
      </span>
    </a>
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

function AppleGlyph({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M16.46 12.42c-.03-3.03 2.48-4.49 2.6-4.56-1.42-2.07-3.62-2.35-4.39-2.39-1.85-.19-3.64 1.1-4.58 1.1-.96 0-2.41-1.07-3.98-1.04-2.03.03-3.92 1.2-4.96 3.03-2.14 3.7-.55 9.14 1.5 12.13 1.03 1.47 2.23 3.11 3.79 3.05 1.53-.06 2.1-.98 3.95-.98 1.83 0 2.37.98 3.97.95 1.64-.03 2.67-1.48 3.66-2.97 1.19-1.68 1.66-3.34 1.68-3.42-.04-.01-3.2-1.23-3.24-4.9Z" />
      <path d="M13.46 3.5c.83-1.04 1.39-2.45 1.24-3.87-1.2.05-2.7.83-3.56 1.84-.76.88-1.44 2.35-1.26 3.72 1.35.1 2.72-.68 3.58-1.69Z" />
    </svg>
  )
}

function PlayGlyph({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
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
  const items = useMemo(
    () => micrositeMenuItemsForPartner(partner, config.elementText),
    [config.elementText, partner],
  )
  const filters = useMemo(() => menuFiltersForItems(items, config.language), [config.language, items])
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
  const previewItems = micrositeMenuPreviewItems(
    items,
    config.elementText["content.menuFeaturedItemKey"],
    6,
  )
  const imageLessCount = items.filter(
    (item) => item.micrositeShowImage !== false && !item.image_url,
  ).length

  return (
    <section id="speisekarte" className={`${restaurantSectionClass(template, "menu")} scroll-mt-24 px-5 py-12 @min-[640px]:px-8 @min-[1024px]:px-10`}>
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
              className="mt-3 text-[clamp(2rem,4cqw,3rem)] font-black leading-tight tracking-[-0.04em]"
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

          {imageLessCount ? (
            <p className="max-w-xs rounded-xl border border-zinc-200/75 bg-white px-4 py-3 text-sm font-medium leading-5 text-zinc-600 shadow-[0_8px_24px_-18px_rgba(15,23,42,.35)]">
              {siteCopy(
                config,
                "Speisen und Getränke ohne Bild erhalten automatisch einen passenden Platzhalter.",
                "Food and drinks without an image automatically receive a suitable placeholder.",
              )}
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
                  config={config}
                />
              ))}
            </div>

            <div className="mt-6 flex justify-center rounded-[1.2rem] border border-[color-mix(in_srgb,var(--site-accent)_18%,white)] bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,.32)]">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="premium-button premium-button-shine rounded-2xl bg-[var(--site-accent)] px-8 py-4 text-base font-black text-white shadow-[0_16px_32px_-18px_var(--site-accent)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                {siteCopy(config, "Komplette Speisekarte öffnen", "Open full menu")}
              </button>
            </div>

            {menuOpen ? (
              <div
                className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label={siteCopy(config, "Komplette Speisekarte", "Full menu")}
              >
                <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.4rem] bg-white shadow-2xl">
                  <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 @min-[768px]:flex-row @min-[768px]:items-start @min-[768px]:justify-between">
                    <div>
                      <h3 className="text-2xl font-black tracking-[-0.04em]">
                        {siteCopy(config, "Komplette Speisekarte", "Full menu")}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMenuOpen(false)}
                      className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-xl font-bold text-zinc-700 transition hover:bg-zinc-50"
                      aria-label={siteCopy(config, "Speisekarte schließen", "Close menu")}
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
                        placeholder={siteCopy(config, "Gericht, Getränk oder Kategorie suchen", "Search dishes, drinks or categories")}
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
                            config={config}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[1.2rem] border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
                        {siteCopy(config, "Für diese Suche oder diesen Filter gibt es aktuell keine Einträge.", "There are currently no items for this search or filter.")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-7 rounded-[1.2rem] border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
            {siteCopy(config, "Sobald im Admin eine Speisekarte gepflegt ist, erscheinen hier automatisch die beliebtesten Gerichte.", "Once a menu is added in the admin, the most popular dishes will appear here automatically.")}
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
    <section className={`${restaurantSectionClass(template, "about")} px-5 pb-14 pt-8 @min-[640px]:px-8 @min-[640px]:pb-16 @min-[1024px]:px-10`}>
      <div
        id="ueber-uns"
        className="premium-reveal relative mx-auto max-w-6xl scroll-mt-24 overflow-hidden rounded-[1.85rem] border border-white/80 bg-white shadow-[0_30px_85px_rgba(15,23,42,.10)]"
      >
        <BrandedImage
          src={aboutHeroImage}
          alt={siteCopy(config, "Hintergrundbild über den Partner", "Partner story background")}
          editableId="content.aboutHeroImageUrl"
          editableLabel="Über uns Hintergrundbild (Desktop)"
          className="premium-about-background premium-parallax absolute inset-0 h-full w-full object-cover @min-[900px]:inset-y-0 @min-[900px]:left-auto @min-[900px]:right-0 @min-[900px]:w-[62%]"
          data-parallax-strength="strong"
          style={imageStyleFor(config, "content.aboutHeroImageUrl")}
        />
        <BrandedImage
          src={aboutPrepImage}
          alt={siteCopy(config, "Detailbild des Partners", "Partner detail image")}
          editableId="content.aboutPrepImageUrl"
          editableLabel="Über uns unteres Overlaybild (Desktop)"
          className="absolute bottom-0 right-0 hidden h-[34%] w-[46%] object-cover opacity-65 blur-[.2px] @min-[900px]:block"
          style={imageStyleFor(config, "content.aboutPrepImageUrl")}
        />
        <div className="premium-about-scrim pointer-events-none absolute inset-0" />
        <div className="relative grid min-h-[480px] gap-5 px-6 py-5 @min-[760px]:px-8 @min-[1024px]:grid-cols-[.54fr_.46fr] @min-[1024px]:px-9 @min-[1024px]:py-6">
          <div className="max-w-[620px]">
            <h2
              {...editable("content.aboutHeadline", "text", "Über uns Überschrift")}
              className="text-[clamp(2rem,3.2cqw,2.95rem)] font-black leading-[1.04] tracking-[-0.04em] text-zinc-950"
              style={textStyleFor(config, "content.aboutHeadline")}
            >
              {textValue(config, "content.aboutHeadline", aboutHeadlineFor(config))}
            </h2>
            <p
              {...editable("content.aboutSlogan", "text", "Über uns Slogan")}
              className="mt-2.5 max-w-xl text-[clamp(1.05rem,1.75cqw,1.28rem)] font-semibold italic leading-tight text-[var(--site-accent)]"
              style={textStyleFor(config, "content.aboutSlogan")}
            >
              {textValue(
                config,
                "content.aboutSlogan",
                siteCopy(config, "Aus Leidenschaft für gutes Essen und unsere Heimat.", "Driven by a love for good food and our community."),
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
                  siteCopy(config, "Ob in der Mittagspause, nach der Wanderung oder beim Abendessen mit Freunden – wir sind für dich da. Schnell, lecker und immer mit einem Lächeln.", "Whether it is a lunch break, a quick stop or dinner with friends, we are here for you — quick, delicious and always with a smile."),
                )}
              </p>
              <p
                {...editable("content.aboutThanks", "text", "Über uns Dank")}
                className="font-black text-zinc-950"
                style={textStyleFor(config, "content.aboutThanks")}
              >
                {textValue(config, "content.aboutThanks", siteCopy(config, "Danke, dass ihr uns besucht!", "Thank you for visiting us!"))}
              </p>
            </div>

            <p
              {...editable("content.aboutSignature", "text", "Über uns Signatur")}
              className="mt-3 text-[1.35rem] font-semibold italic text-zinc-950"
              style={textStyleFor(config, "content.aboutSignature")}
            >
              {textValue(config, "content.aboutSignature", siteCopy(config, "Euer Team vor Ort", "Your local team"))}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 @min-[640px]:grid-cols-4">
              <AboutValueCard
                id="content.aboutValue.0"
                icon="leaf"
                fallback={siteCopy(config, "Täglich frisch", "Fresh daily")}
                config={config}
              />
              <AboutValueCard
                id="content.aboutValue.1"
                icon="bowl"
                fallback={siteCopy(config, "Hausgemachte Saucen", "Homemade sauces")}
                config={config}
              />
              <AboutValueCard
                id="content.aboutValue.2"
                icon="smile"
                fallback={siteCopy(config, "Freundlicher Service", "Friendly service")}
                config={config}
              />
              <AboutValueCard
                id="content.aboutValue.3"
                icon="pizza"
                fallback={siteCopy(config, "Vielfältige Auswahl", "Plenty of choice")}
                config={config}
              />
            </div>
          </div>

          <div className="premium-about-photos relative mt-7 grid grid-cols-2 gap-3 @min-[1024px]:mt-0 @min-[1024px]:block @min-[1024px]:min-h-[400px]">
            <figure className="relative w-full -rotate-3 rounded-2xl bg-white p-1.5 shadow-[0_22px_46px_rgba(15,23,42,.20)] @min-[1024px]:absolute @min-[1024px]:left-2 @min-[1024px]:top-[155px] @min-[1024px]:w-[44%]">
              <BrandedImage
                src={aboutIngredientImage}
                alt={siteCopy(config, "Bild zu Qualität und Zutaten", "Quality and ingredients image")}
                editableId="content.aboutIngredientImageUrl"
                editableLabel="Über uns linkes Kartenbild"
                className="aspect-[4/5] w-full rounded-xl object-cover"
                style={imageStyleFor(config, "content.aboutIngredientImageUrl")}
              />
            </figure>
            <figure className="relative w-full rotate-2 rounded-2xl bg-white p-1.5 shadow-[0_22px_46px_rgba(15,23,42,.20)] @min-[1024px]:absolute @min-[1024px]:right-5 @min-[1024px]:top-[164px] @min-[1024px]:w-[44%]">
              <BrandedImage
                src={aboutLocationImage}
                alt={siteCopy(config, "Bild zum Standort", "Location image")}
                editableId="content.aboutLocationImageUrl"
                editableLabel="Über uns rechtes Kartenbild"
                className="aspect-[4/5] w-full rounded-xl object-cover"
                style={imageStyleFor(config, "content.aboutLocationImageUrl")}
              />
            </figure>
          </div>
        </div>
      </div>

      <div
        id="kontakt"
        className="premium-reveal relative z-[2] mx-auto mt-10 max-w-6xl scroll-mt-24 overflow-hidden rounded-[1.65rem] bg-[#101010] p-3 text-white shadow-[0_30px_90px_rgba(15,23,42,.26)]"
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
  const phone = partner.phone || siteCopy(config, "Telefon im Admin ergänzen", "Add phone number in admin")
  const opening = textValue(
    config,
    "content.contactOpening",
    config.hero.openingText.replace(
      config.language === "en" ? "Open today ·" : "Heute geöffnet ·",
      config.language === "en" ? "Daily" : "Täglich",
    ),
  )
  const mapsQuery = mapsQueryForPartner(partner, address)
  const mapsEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapsQuery)}&output=embed`
  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`
  const phoneHref = partner.phone ? `tel:${partner.phone.replace(/[^\d+]/g, "")}` : undefined

  return (
    <div className="grid gap-4 @min-[900px]:grid-cols-[.44fr_.56fr]">
      <div className="flex min-h-[350px] flex-col justify-between rounded-[1.1rem] border border-white/10 bg-white/[.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.08)] @min-[900px]:min-h-[380px]">
        <div>
          <h2
            {...editable("content.contactHeadline", "text", "Kontakt Überschrift")}
            className="max-w-[12ch] text-[clamp(1.75rem,3cqw,2.35rem)] font-black leading-[1.02] tracking-[-0.04em]"
            style={textStyleFor(config, "content.contactHeadline")}
          >
            {textValue(config, "content.contactHeadline", contactHeadlineFor(config))}
          </h2>
          <p
            {...editable("content.contactSlogan", "text", "Kontakt Slogan")}
            className="mt-1.5 text-[1.1rem] font-semibold italic leading-tight text-[var(--site-accent)]"
            style={textStyleFor(config, "content.contactSlogan")}
          >
            {textValue(config, "content.contactSlogan", siteCopy(config, "Wir freuen uns auf dich.", "We look forward to seeing you."))}
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
            <ContactInfoLine id="content.contact.address" icon="pin" label={siteCopy(config, "Adresse", "Address")} value={address} config={config} />
            <ContactInfoLine id="content.contact.phone" icon="phone" label={siteCopy(config, "Telefon", "Phone")} value={phone} config={config} />
            <ContactInfoLine id="content.contact.opening" icon="clock" label={siteCopy(config, "Öffnungszeiten", "Opening hours")} value={opening} config={config} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 @min-[760px]:hidden">
            <a
              href={routeUrl}
              target="_blank"
              rel="noreferrer"
              className="col-span-2 rounded-xl bg-[var(--site-accent)] px-4 py-3 text-center text-sm font-black text-white shadow-[0_12px_28px_rgba(245,158,11,.28)]"
            >
              {siteCopy(config, "Route", "Directions")}
            </a>
            <a
              href={phoneHref || "#kontakt"}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white"
            >
              {siteCopy(config, "Anrufen", "Call")}
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm font-bold text-white"
            >
              {siteCopy(config, "Karte", "Map")}
            </a>
          </div>
        </div>

        <div className="mt-5 rounded-[1rem] border border-white/10 bg-white/[.045] p-3 text-zinc-300">
          <p
            {...editable("content.contactSocialText", "text", "Social-Media-Text")}
            className="text-sm font-semibold leading-snug"
            style={textStyleFor(config, "content.contactSocialText")}
          >
            {textValue(config, "content.contactSocialText", siteCopy(config, "Folge uns für Aktionen & Neuigkeiten.", "Follow us for offers and news."))}
          </p>
          <div className="mx-auto mt-4 grid w-full max-w-[13rem] grid-cols-2 items-start justify-items-center gap-x-5 gap-y-4 @min-[520px]:mx-0 @min-[520px]:mt-3 @min-[520px]:flex @min-[520px]:max-w-none @min-[520px]:flex-wrap @min-[520px]:items-center">
            {socialPlatforms
              .filter((item) =>
                socialVisible(config, partner, item.platform),
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
      </div>
    </div>
  )
}

function FaqSection({ config }: { config: MicrositeConfig }) {
  const [openIndex, setOpenIndex] = useState(0)
  const faqItems = config.language === "en"
    ? [
        { question: "How does the stamp card work?", answer: "Check in with the Benefitsi app after your visit to collect stamps automatically. When you reach a reward, it unlocks in the app." },
        { question: "Which benefits are included with Premium?", answer: "Premium members receive additional deals, exclusive rewards and special offers from participating local partners." },
        { question: "How do I use a 2-for-1 deal?", answer: "Activate the benefit in the app before ordering, then show the active benefit when you pay." },
        { question: "Do I need the Benefitsi app?", answer: "Yes. Deals, stamps and rewards are collected and redeemed digitally in the app." },
        { question: "Can I order online?", answer: "If the partner offers online ordering, you will find the relevant button on the microsite or in the Benefitsi app." },
        { question: "Does it cost anything to participate?", answer: "Many benefits are free to use. Some premium benefits are reserved for Benefitsi Premium members." },
      ]
    : defaultMicrositeFaqItems

  return (
    <section id="faq" className="scroll-mt-24 bg-[var(--site-bg)] px-5 py-10 @min-[640px]:px-8 @min-[1024px]:px-10">
      <div className="premium-liquid-panel premium-reveal relative mx-auto max-w-6xl overflow-hidden rounded-[1.85rem] p-5 @min-[900px]:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-[color-mix(in_srgb,var(--site-accent)_10%,transparent)] blur-3xl" />
        <div className="grid gap-5 @min-[900px]:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)] @min-[900px]:items-end">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[.15em] text-[var(--site-accent)]">
              {siteCopy(config, "Kurz erklärt", "Good to know")}
            </p>
            <h2
              {...editable("content.faqHeadline", "text", "FAQ Überschrift")}
              className="text-[clamp(2rem,3.4cqw,3.1rem)] font-black leading-[1.03] tracking-[-0.04em] text-zinc-950"
              style={textStyleFor(config, "content.faqHeadline")}
            >
              {textValue(config, "content.faqHeadline", siteCopy(config, "Häufige Fragen. Schnelle Antworten.", "Common questions. Quick answers."))}
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
              siteCopy(config, "Alles Wichtige zu deiner Benefitsi Mitgliedschaft und den Vorteilen bei diesem Partner.", "Everything you need to know about your Benefitsi membership and this partner's benefits."),
            )}
          </p>
        </div>

        <div className="mt-7 grid gap-3 @min-[900px]:grid-cols-2">
          {faqItems.map((item, index) => (
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
    <article className={`premium-liquid-panel premium-faq-item overflow-hidden rounded-[1.15rem] ${isOpen ? "border-[color-mix(in_srgb,var(--site-accent)_40%,white)]" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-4 px-4 py-4 text-left @min-[640px]:px-5"
        aria-expanded={isOpen}
      >
        <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-black tabular-nums transition ${isOpen ? "bg-[var(--site-accent)] text-white" : "bg-white/70 text-zinc-500 shadow-sm"}`}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          {...editable(`content.faq.${index}.question`, "text", "FAQ Frage")}
          className="min-w-0 flex-1 text-base font-semibold leading-snug tracking-[-0.025em] text-zinc-950"
          style={textStyleFor(config, `content.faq.${index}.question`)}
        >
          {textValue(config, `content.faq.${index}.question`, item.question)}
        </span>
        <span className={`grid size-8 shrink-0 place-items-center rounded-full border transition duration-300 ${isOpen ? "border-[var(--site-accent)] bg-[var(--site-accent)] text-white" : "border-white/80 bg-white/65 text-zinc-700 group-hover:border-[var(--site-accent)]"}`}>
          {isOpen ? (
            <Minus className="size-4 text-white" strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
          )}
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-500 [transition-timing-function:var(--ease-out-expo)] ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p
            {...editable(`content.faq.${index}.answer`, "text", "FAQ Antwort")}
            className="px-4 pb-5 pl-16 text-sm leading-6 text-zinc-600 @min-[640px]:px-5 @min-[640px]:pl-[4.75rem]"
            style={textStyleFor(config, `content.faq.${index}.answer`)}
          >
            {textValue(config, `content.faq.${index}.answer`, item.answer)}
          </p>
        </div>
      </div>
    </article>
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
    <div className="premium-liquid-panel premium-ecosystem-card rounded-[1.05rem] px-3 py-2.5 text-center">
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
    <footer id="footer" className="mt-10 scroll-mt-24 bg-[#efe8df] px-5 pb-6 pt-0 text-sm text-zinc-600 @min-[480px]:rounded-b-[1.6rem] @min-[640px]:mt-16 @min-[640px]:px-8 @min-[1024px]:px-10">
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
              <img
                src={config.appearance?.mode === "dark" ? "/benefitsi-logo-on-dark.svg" : "/benefitsi-logo-on-light.svg"}
                alt="Benefitsi"
                className="h-9 w-auto max-w-[180px] object-contain"
              />
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
              siteCopy(config, "Wir verbinden Menschen mit lokalen Partnern und machen Vorteile einfach nutzbar – digital, transparent und fair.", "We connect people with local partners and make benefits easy to use — digital, transparent and fair."),
            )}
          </p>

          <div className="mt-4 grid max-w-[360px] grid-cols-3 gap-3">
            <FooterTrustItem id="footer.trust.0" icon="shield" label={siteCopy(config, "Sicher & geprüft", "Safe & verified")} config={config} />
            <FooterTrustItem id="footer.trust.1" icon="privacy" label={siteCopy(config, "DSGVO-konform", "GDPR compliant")} config={config} />
            <FooterTrustItem id="footer.trust.2" icon="local" label={siteCopy(config, "Lokale Partner", "Local partners")} config={config} />
          </div>
        </div>

        <FooterLinkColumn
          title={siteCopy(config, "Entdecken", "Explore")}
          links={[
            { label: siteCopy(config, "Deals & Vorteile", "Deals & benefits"), href: "#deals" },
            { label: siteCopy(config, "Stempelkarte", "Stamp card"), href: "#stempelkarte" },
            { label: siteCopy(config, "Speisekarte", "Menu"), href: "#speisekarte" },
          ]}
        />
        <FooterLinkColumn
          title={siteCopy(config, "Der Partner", "The partner")}
          links={[
            { label: siteCopy(config, "Über uns", "About us"), href: "#ueber-uns" },
            { label: siteCopy(config, "Kontakt & Route", "Contact & directions"), href: "#kontakt" },
          ]}
        />
        <FooterLinkColumn
          title="Benefitsi"
          links={[
            { label: "Benefitsi-App", href: "#app" },
            { label: siteCopy(config, "Hilfe & FAQ", "Help & FAQ"), href: "#faq" },
          ]}
        />
      </div>
    </footer>
  )
}

function FooterLinkColumn({
  title,
  links,
}: {
  title: string
  links: Array<{ label: string; href: string }>
}) {
  return (
    <div>
      <h3 className="text-sm font-black tracking-[-0.03em] text-zinc-950">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="text-sm text-zinc-500 transition hover:text-[var(--site-accent)]"
            >
              {link.label}
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

function BrandedImage({
  src,
  alt,
  className,
  style,
  editableId,
  editableLabel = "Bild",
  dataParallaxStrength,
  priority = false,
}: {
  src?: string | null
  alt: string
  className: string
  style?: CSSProperties
  editableId?: string
  editableLabel?: string
  dataParallaxStrength?: "strong"
  priority?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const available = Boolean(src && failedSrc !== src)
  const attrs = editableId ? editable(editableId, "image", editableLabel) : {}

  if (available && src) {
    return (
      <img
        {...attrs}
        src={src}
        alt={alt}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onError={() => setFailedSrc(src)}
        className={className}
        data-parallax-strength={dataParallaxStrength}
        style={style}
      />
    )
  }

  return (
    <div
      {...attrs}
      role="img"
      aria-label={alt || ("Benefitsi Platzhalterbild")}
      className={`premium-branded-image ${className}`}
      data-parallax-strength={dataParallaxStrength}
      style={style}
    >
      <img
        src={BENEFITSI_ICON_SRC}
        alt=""
        className="relative z-[1] h-auto min-w-8 w-[30%] max-w-24 object-contain opacity-[.18] saturate-75"
      />
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
      className={`grid ${sizeClass} shrink-0 place-items-center rounded-full border border-zinc-200/90 bg-white p-[2px] shadow-[0_5px_14px_rgba(15,23,42,.045)]`}
    >
      <img
        src={src}
        alt=""
        onError={() => setFailedSrc(src || null)}
        className="h-full w-full rounded-full bg-white object-contain p-1"
        style={style}
      />
    </span>
  ) : (
    <span
      {...attrs}
      className={`grid ${sizeClass} place-items-center rounded-full border border-zinc-200/90 bg-white p-1.5 shadow-[0_5px_14px_rgba(15,23,42,.045)]`}
      style={style}
    >
      <img src={BENEFITSI_ICON_SRC} alt="Benefitsi" className="h-full w-full object-contain" />
    </span>
  )
}

function Badge({ config }: { config: MicrositeConfig }) {
  return (
    <div className="flex w-fit max-w-full items-center gap-2 rounded-full border border-white/85 bg-white/70 px-3 py-2 text-[11px] font-semibold text-zinc-800 shadow-[0_10px_28px_rgba(78,45,18,.08)] backdrop-blur-xl @min-[640px]:text-xs">
      <img
        src={BENEFITSI_ICON_SRC}
        alt=""
        className="size-4 shrink-0 object-contain"
      />
      <span
        {...editable("hero.badgeText", "text", "Badge-Text")}
        style={textStyleFor(config, "hero.badgeText")}
      >
        {config.hero.badgeText}
      </span>
      <ChevronDown className="size-3.5 -rotate-90 text-zinc-500" strokeWidth={2} aria-hidden="true" />
    </div>
  )
}

function AppDownloadQrPopup({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const [open, setOpen] = useState(true)
  const appUrl = textValue(config, "content.appDownloadUrl", appDownloadUrlForPartner(partner))
  const qrUrl = BENEFITSI_APP_QR_SRC

  if (!open) return null

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={siteCopy(config, "Benefitsi App herunterladen", "Download the Benefitsi app")}
      className="fixed bottom-3 right-3 z-[45] w-[calc(100%-1.5rem)] max-w-[420px] @min-[620px]:bottom-5 @min-[620px]:right-5 @min-[620px]:w-[min(420px,calc(100%-2.5rem))]"
    >
      <div className="premium-liquid-panel relative overflow-hidden rounded-[1.3rem] p-3 pr-10 shadow-[0_20px_56px_rgba(15,23,42,.18)]">
        <div className="pointer-events-none absolute -left-16 -top-24 size-72 rounded-full bg-[color-mix(in_srgb,var(--site-accent)_22%,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-0 size-64 rounded-full bg-[color-mix(in_srgb,var(--site-tertiary)_15%,transparent)] blur-3xl" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-full border border-white/75 bg-white/70 text-zinc-700 shadow-sm backdrop-blur-xl transition hover:bg-white hover:text-zinc-950 active:scale-95"
          aria-label={siteCopy(config, "App-Hinweis schließen", "Close app prompt")}
        >
          <X className="size-4" strokeWidth={2.2} aria-hidden="true" />
        </button>

        <div className="relative grid grid-cols-[78px_minmax(0,1fr)] items-center gap-3 @min-[620px]:grid-cols-[92px_minmax(0,1fr)]">
          <a
            href={appUrl}
            className="premium-qr-surface group relative aspect-square rounded-2xl bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,.11)] ring-1 ring-zinc-200/80"
            aria-label={siteCopy(config, "QR-Code zur Benefitsi App öffnen", "Open the Benefitsi app QR code")}
          >
            <img
              src={qrUrl}
              alt={siteCopy(config, "QR-Code für die Benefitsi App", "QR code for the Benefitsi app")}
              className="h-full w-full rounded-xl object-contain transition duration-500 group-hover:scale-[1.03]"
            />
          </a>

          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[.14em] text-[var(--site-accent)] @min-[620px]:text-xs">
              Benefitsi App
            </p>
            <h2
              {...editable("content.appPopupHeadline", "text", "App Popup Überschrift")}
              className="mt-0.5 pr-1 text-base font-black leading-tight tracking-[-.035em] text-zinc-950 @min-[620px]:text-lg"
              style={textStyleFor(config, "content.appPopupHeadline")}
            >
              {textValue(config, "content.appPopupHeadline", siteCopy(config, "Scannen und App holen", "Scan to get the app"))}
            </h2>
            <p
              {...editable("content.appPopupText", "text", "App Popup Text")}
              className="mt-1 hidden whitespace-nowrap text-[10px] leading-4 text-zinc-600 @min-[620px]:block"
              style={textStyleFor(config, "content.appPopupText")}
            >
              {textValue(
                config,
                "content.appPopupText",
                siteCopy(config, "QR-Code scannen. Vorteile sichern.", "Scan the QR code. Get your benefits."),
              )}
            </p>
            <a
              href={appUrl}
              className="mt-2 inline-flex items-center gap-2 text-xs font-black text-zinc-950 @min-[620px]:hidden"
            >
              {siteCopy(config, "App öffnen", "Open app")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
            <div className="mt-2 hidden grid-cols-2 gap-1.5 @min-[620px]:grid">
              <StoreBadge store="app-store" href={appUrl} language={config.language} compact />
              <StoreBadge store="google-play" href={appUrl} language={config.language} compact />
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function PartnerSocialFeed({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  const enabled = textValue(config, "content.socialFeed.enabled", "true") !== "false"
  const requestedPlatform = textValue(config, "content.socialFeed.platform", "instagram")
  const platform: "instagram" | "tiktok" = requestedPlatform === "tiktok" ? "tiktok" : "instagram"
  const profileUrl = textValue(config, `social.${platform}.url`, "").trim() || partnerSocialUrl(partner, platform)
  const configuredPostUrls = SOCIAL_FEED_POST_INDICES
    .map((index) => textValue(config, `content.socialFeed.${platform}.${index}.url`, "").trim())
    .filter(Boolean)
  const posts = Array.from(new Set(configuredPostUrls))
    .map((url) => ({ url, embedUrl: socialPostEmbedUrl(platform, url) }))
    .filter((post): post is { url: string; embedUrl: string } => Boolean(post.embedUrl))

  if (!enabled || !posts.length || (platform === "instagram" && posts.length < 2)) return null

  const PlatformIcon = platform === "tiktok" ? FaTiktok : FaInstagram
  const gridClass = posts.length === 1
    ? "@min-[760px]:grid-cols-[minmax(0,560px)]"
    : posts.length === 2
      ? "@min-[760px]:grid-cols-2"
      : "@min-[760px]:grid-cols-3"

  return (
    <section className="bg-[var(--site-bg)] px-5 pb-8 pt-7 @min-[640px]:px-8 @min-[1024px]:px-10">
      <div className="mx-auto max-w-6xl border-t border-zinc-200/75 pt-9 @min-[760px]:pt-12">
        <div className="premium-reveal grid gap-5 @min-[760px]:grid-cols-[minmax(0,1fr)_auto] @min-[760px]:items-end">
          <div className="min-w-0 max-w-3xl pb-1">
            <p
              {...editable("content.socialFeedKicker", "text", "Social Feed Label")}
              className="text-xs font-black uppercase tracking-[.15em] text-[var(--site-accent)]"
              style={textStyleFor(config, "content.socialFeedKicker")}
            >
              {textValue(
                config,
                "content.socialFeedKicker",
                siteCopy(config, "Direkt aus dem Feed", "Straight from the feed"),
              )}
            </p>
            <h2
              {...editable("content.socialFeedHeadline", "text", "Social Feed Überschrift")}
              className="mt-3 overflow-visible pb-1 text-[clamp(1.9rem,5cqw,3.5rem)] font-black leading-[1.08] tracking-[-.04em] text-zinc-950 [text-wrap:balance]"
              style={textStyleFor(config, "content.socialFeedHeadline")}
            >
              {textValue(
                config,
                "content.socialFeedHeadline",
                platform === "tiktok"
                  ? siteCopy(config, "Neu auf TikTok.", "Latest on TikTok.")
                  : siteCopy(config, "Aus unserem Instagram.", "From our Instagram."),
              )}
            </h2>
          </div>

          <a
            href={profileUrl || posts[0].url}
            target="_blank"
            rel="noreferrer"
            className="premium-button group inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white/75 px-4 py-2.5 text-xs font-black text-zinc-800 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[var(--site-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
          >
            <PlatformIcon className="size-4 text-[var(--site-accent)]" aria-hidden="true" />
            {platform === "tiktok"
              ? siteCopy(config, "Auf TikTok folgen", "Follow on TikTok")
              : siteCopy(config, "Auf Instagram folgen", "Follow on Instagram")}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </a>
        </div>

        {platform === "instagram" ? (
          <InstagramEmbedWall
            posts={posts}
            config={config}
          />
        ) : posts.length ? (
          <div className={`mt-7 grid gap-4 ${gridClass}`}>
            {posts.map((post, index) => (
              <article
                key={`${post.url}-${index}`}
                className="premium-liquid-panel premium-ecosystem-card premium-reveal min-w-0 overflow-hidden rounded-[1.5rem] p-2"
                style={{ "--reveal-index": index } as CSSProperties}
              >
                <div className={`overflow-hidden rounded-[1.15rem] bg-white ${platform === "tiktok" ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
                  <iframe
                    src={post.embedUrl}
                    title={`${platform === "tiktok" ? "TikTok" : "Instagram"} ${siteCopy(config, "Beitrag", "post")} ${index + 1}`}
                    className="h-full w-full border-0"
                    loading="lazy"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function InstagramEmbedWall({
  posts,
  config,
}: {
  posts: Array<{ url: string; embedUrl: string }>
  config: MicrositeConfig
}) {
  const desktopCardClass = posts.length === 2
    ? "@min-[760px]:basis-[calc((100%-1rem)/2)]"
    : "@min-[760px]:basis-[calc((100%-2rem)/3)]"

  return (
    <div className="premium-instagram-embed mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-color:color-mix(in_srgb,var(--site-accent)_45%,transparent)_transparent] [scrollbar-width:thin]">
      {posts.map((post, index) => (
        <article
          key={post.url}
          className={`premium-liquid-panel premium-ecosystem-card premium-reveal min-w-0 max-w-[340px] basis-[82%] shrink-0 snap-start overflow-hidden rounded-[1.3rem] p-2 @min-[760px]:max-w-none ${desktopCardClass}`}
          style={{ "--reveal-index": index } as CSSProperties}
        >
          <div className="relative h-[410px] overflow-hidden rounded-[1rem] bg-white @min-[760px]:h-[440px]">
            <iframe
              src={post.embedUrl}
              title={`Instagram ${siteCopy(config, "Beitrag", "post")} ${index + 1}`}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              allow="encrypted-media; picture-in-picture; web-share"
            />
          </div>
        </article>
      ))}
    </div>
  )
}

function socialPostEmbedUrl(
  platform: "instagram" | "tiktok",
  value: string,
) {
  try {
    const url = new URL(value)

    if (platform === "instagram") {
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return ""
      const postPath = url.pathname.match(/^\/(p|reel|tv)\/[^/]+/i)?.[0]
      return postPath ? `https://www.instagram.com${postPath}/embed/captioned/` : ""
    }

    if (!/(^|\.)tiktok\.com$/i.test(url.hostname)) return ""
    const videoId = url.pathname.match(/\/video\/(\d+)/)?.[1]
    return videoId
      ? `https://www.tiktok.com/player/v1/${videoId}?autoplay=0&loop=0&music_info=1&description=1`
      : ""
  } catch {
    return ""
  }
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
      className={`flex min-w-0 items-center gap-3 overflow-visible ${accent ? "text-emerald-600" : ""}`}
      style={textStyleFor(config, id)}
    >
      <ThemeIcon
        id={iconId}
        name={iconName}
        config={config}
        label={`${text} Icon`}
        className={`grid size-6 shrink-0 place-items-center overflow-visible ${accent ? "text-emerald-500" : "text-current"}`}
        iconClassName={iconName === "status" ? "block size-3.5 animate-pulse rounded-full bg-emerald-500 ring-4 ring-emerald-100 text-transparent" : "size-5 overflow-visible"}
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
  const href = primary ? "#deals" : "#speisekarte"

  return (
    <a
      {...editable(id, "text", "Startbereich Button")}
      href={href}
      className={`premium-button group inline-flex min-h-11 items-center justify-center gap-3 rounded-xl px-6 py-3 text-center text-sm font-black transition duration-300 hover:-translate-y-1 ${
        primary
          ? "premium-button-shine premium-button-shine-subtle bg-[var(--site-accent)] text-white shadow-[0_16px_30px_-16px_var(--site-accent)] hover:brightness-105"
          : "premium-hero-secondary bg-white text-[var(--site-secondary)] shadow-[0_12px_26px_-20px_var(--site-secondary)] ring-1 ring-black/10 hover:ring-[var(--site-tertiary)]"
      }`}
      style={textStyleFor(config, id)}
    >
      {label}
      {primary ? (
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      ) : null}
    </a>
  )
}

function QuoteSection({ config }: { config: MicrositeConfig }) {
  const quote = config.content.quoteText
  const quoteCharacters = useMemo(() => Array.from(quote), [quote])
  const quoteTokens = useMemo(() => {
    const tokens = quote.split(/(\s+)/).filter(Boolean)

    return tokens.map((token, tokenIndex) => {
      const characters = Array.from(token)
      const start = Array.from(tokens.slice(0, tokenIndex).join("")).length
      return { token, characters, start }
    })
  }, [quote])
  const [typingState, setTypingState] = useState({
    quote,
    visibleCharacterCount: quoteCharacters.length,
  })
  const visibleCharacterCount =
    typingState.quote === quote
      ? typingState.visibleCharacterCount
      : quoteCharacters.length
  const sectionRef = useRef<HTMLElement | null>(null)
  const typedRef = useRef(false)

  useEffect(() => {
    typedRef.current = false

    const section = sectionRef.current
    if (!section) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reducedMotion) return

    let frame = 0
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || typedRef.current) return

        typedRef.current = true
        setTypingState({ quote, visibleCharacterCount: 0 })
        const duration = Math.max(1400, Math.min(3000, quoteCharacters.length * 28))
        let startedAt: number | null = null

        const typeFrame = (time: number) => {
          startedAt ??= time
          const progress = Math.min((time - startedAt) / duration, 1)
          const easedProgress = 1 - Math.pow(1 - progress, 2)
          setTypingState({
            quote,
            visibleCharacterCount: Math.floor(easedProgress * quoteCharacters.length),
          })

          if (progress < 1) {
            frame = window.requestAnimationFrame(typeFrame)
          } else {
            setTypingState({ quote, visibleCharacterCount: quoteCharacters.length })
          }
        }

        frame = window.requestAnimationFrame(typeFrame)
        observer.disconnect()
      },
      { threshold: 0.35 },
    )

    observer.observe(section)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [quote, quoteCharacters.length])

  return (
    <section
      ref={sectionRef}
      id="partner-zitat"
      className="premium-quote-shell relative bg-[var(--site-bg)] px-6 pb-16 pt-14 text-[var(--site-secondary)] @min-[640px]:px-10 @min-[900px]:pb-20 @min-[900px]:pt-16 @min-[1024px]:px-12"
    >
      <div className="premium-reveal relative mx-auto max-w-6xl text-center">
        <span className="mx-auto block w-fit text-[var(--site-accent)] opacity-65">
          <QuoteIcon className="size-7" strokeWidth={1.6} aria-hidden="true" />
        </span>
        <blockquote
          {...editable("content.quoteText", "text", "Partner-Zitat")}
          aria-label={quote}
          className="mx-auto mt-7 max-w-[30ch] whitespace-pre-wrap text-center text-[clamp(1.6rem,4.3cqw,3.65rem)] font-black leading-[1.12] tracking-[-0.035em] text-zinc-950 [text-wrap:balance]"
          style={textStyleFor(config, "content.quoteText")}
        >
          <span aria-hidden="true">
            {quoteTokens.map(({ token, characters, start }, tokenIndex) =>
              /^\s+$/.test(token) ? (
                <span key={`space-${tokenIndex}`}>{token}</span>
              ) : (
                <span key={`${token}-${tokenIndex}`} className="inline-block">
                  {characters.map((character, characterIndex) => (
                    <span
                      key={`${character}-${characterIndex}`}
                      className={`transition-[opacity,filter] duration-300 ease-out ${
                        start + characterIndex < visibleCharacterCount ? "opacity-100 blur-0" : "opacity-[.14] blur-[.35px]"
                      }`}
                    >
                      {character}
                    </span>
                  ))}
                </span>
              ),
            )}
          </span>
        </blockquote>
        <div className="mt-7 flex items-center justify-center gap-4">
          <span className="premium-quote-rule h-px w-10 @min-[640px]:w-16" aria-hidden="true" />
          <p
            {...editable("content.quoteAttribution", "text", "Zitat-Absender")}
            className="premium-no-text-reveal text-sm font-bold tracking-[-0.01em] text-[color-mix(in_srgb,var(--site-secondary)_58%,white)]"
            style={textStyleFor(config, "content.quoteAttribution")}
          >
            {config.content.quoteAttribution}
          </p>
          <span className="premium-quote-rule h-px w-10 @min-[640px]:w-16" aria-hidden="true" />
        </div>
      </div>
    </section>
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

const lucideThemeIcons: Record<string, LucideIcon> = {
  award: Award,
  badge: BadgeCheck,
  bell: BellRing,
  bag: ShoppingBag,
  leaf: Leaf,
  card: CreditCard,
  people: UsersRound,
  gift: Gift,
  flame: Flame,
  heart: Heart,
  spark: Sparkles,
  percent: Percent,
  star: Star,
  clock: Clock3,
  check: Check,
  home: House,
  share: Share2,
  qr: QrCode,
  trend: TrendingUp,
  pin: MapPin,
  phone: Phone,
  shield: ShieldCheck,
  privacy: LockKeyhole,
  local: MapPinned,
  bowl: Soup,
  smile: Smile,
  pizza: Pizza,
  website: Globe2,
  google: Globe2,
  drink: CupSoda,
  plate: Utensils,
  status: Circle,
}

const brandThemeIcons: Record<string, IconType> = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  youtube: FaYoutube,
  linkedin: FaLinkedinIn,
  whatsapp: FaWhatsapp,
  tiktok: FaTiktok,
  google: FaGoogle,
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

  if (name === "benefitsi") {
    return <BenefitsiMark className={svgClassName} />
  }

  const BrandIcon = brandThemeIcons[name]
  if (BrandIcon) {
    return <BrandIcon aria-hidden="true" className={svgClassName} style={style} />
  }

  const Icon = lucideThemeIcons[name] ?? Sparkles
  return <Icon aria-hidden="true" className={svgClassName} style={style} strokeWidth={1.9} />
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
    maxWidth: style.maxWidth ? `min(${style.maxWidth}px, 100%)` : undefined,
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
    fontSize: style.fontSize
      ? `min(${style.fontSize}px, ${Math.max(12, Math.round(style.fontSize * 0.18))}cqi)`
      : undefined,
    color: style.color,
    fontWeight: style.bold ? 800 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: style.underline ? "underline" : undefined,
    fontFamily: style.fontFamily,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  }
}

function MenuCard({ item, config }: { item: MicrositeMenuItem; config: MicrositeConfig }) {
  const isDrink = isDrinkItem(item)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = item.micrositeShowImage !== false
  const imageFailed = Boolean(item.image_url && failedSrc === item.image_url)
  const imageId = item.micrositeImageId

  return (
    <article className={`premium-card premium-ecosystem-card premium-reveal flex min-w-0 flex-row overflow-hidden rounded-[1.15rem] border border-white/80 bg-white shadow-[0_14px_36px_rgba(15,23,42,.055)] ${showImage ? "items-start gap-3 p-4 @min-[520px]:gap-4" : "items-center p-5"}`}>
      {showImage ? (
        item.image_url && !imageFailed ? (
          <img
            {...(imageId ? editable(imageId, "image", "Menübild") : {})}
            src={item.image_url}
            alt=""
            onError={() => setFailedSrc(item.image_url)}
            className="size-20 shrink-0 rounded-xl object-cover @min-[760px]:size-24"
          />
        ) : (
          <span
            {...(imageId ? editable(imageId, "image", "Menübild") : {})}
            className="grid size-20 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--site-accent)_7%,white)] text-[var(--site-accent)] @min-[760px]:size-24"
            title={
              isDrink
                ? siteCopy(config, "Getränk ohne Bild", "Drink without an image")
                : siteCopy(config, "Speise ohne Bild", "Food without an image")
            }
          >
            <span className="grid size-6 place-items-center rounded-full border-2 border-current">
              <Plus className="size-4" strokeWidth={2.4} aria-hidden="true" />
            </span>
          </span>
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold leading-tight tracking-[-0.03em]">
            {micrositeMenuItemDisplayName(item.name) || siteCopy(config, "Gericht", "Dish")}
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
        {item.addons?.length ? (
          <details className="group mt-3 border-t border-zinc-100 pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 text-xs font-bold text-zinc-600 outline-none transition hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-[var(--site-accent)] [&::-webkit-details-marker]:hidden">
              <span>{siteCopy(config, "Extras anzeigen", "Show extras")} ({item.addons.length})</span>
              <Plus aria-hidden="true" className="size-4 shrink-0 transition group-open:rotate-45" strokeWidth={2.2} />
            </summary>
            <div className="mt-2 space-y-1.5">
              {item.addons.map((addon, index) => (
                <div key={`${addon.title}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0 text-zinc-600">
                    <span className="font-semibold text-zinc-700">{addon.title}</span>
                    {addon.description ? (
                      <span className="block text-zinc-400">
                        {formatAddonDescription(addon.description)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-semibold text-[var(--site-accent)]">+{formatPrice(addon.cost, item.currency)}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </article>
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
  const conciseLabel = ["website", "instagram", "facebook"].includes(platform)
    ? label
    : displayLabel
  const color = socialBadgeBackground(platform)

  return (
    <a
      {...editable(id, "group", `${displayLabel} Social-Media-Schaltfläche`)}
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="grid min-w-0 justify-items-center gap-1.5 text-center text-[10px] font-semibold text-zinc-300 transition hover:-translate-y-0.5 hover:text-white @min-[520px]:min-w-[4.5rem]"
    >
      <span
        {...editable(`${id}.iconUrl`, "image", `${displayLabel} Icon`)}
        className={`grid size-12 place-items-center overflow-hidden rounded-[1rem] ${color} text-white shadow-[0_12px_24px_rgba(0,0,0,.22)] ring-1 ring-white/10 @min-[520px]:size-14 @min-[520px]:rounded-[1.25rem]`}
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
        className="block max-w-full truncate"
        style={textStyleFor(config, `${id}.label`)}
      >
        {conciseLabel}
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
    return <FaTiktok aria-hidden="true" className={sizeClassName} />
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
) {
  const enabled = config.elementText[`social.${platform}.enabled`]
  const configuredUrl = config.elementText[`social.${platform}.url`]?.trim()
  const resolvedUrl = configuredUrl || partnerSocialUrl(partner, platform)

  if (enabled === "false" || !resolvedUrl) {
    return false
  }

  return true
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

  return config.hero.locationText || address || siteCopy(config, "Adresse im Admin ergänzen", "Add address in admin")
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

function micrositeMenuItemsForPartner(
  partner: PartnerWithDeals,
  elementText: MicrositeConfig["elementText"],
) {
  return menuItemsForPartner(partner).map((item) => {
    const imageId = micrositeMenuItemImageId(item)
    const visibilityId = micrositeMenuItemVisibilityId(item)
    const imageOverride = elementText[imageId]?.trim()

    return {
      ...item,
      image_url: imageOverride || item.image_url,
      micrositeImageId: imageId,
      micrositeShowImage: elementText[visibilityId] !== "false",
    }
  })
}

function micrositeRewardIconName(value: string) {
  const lower = value.toLowerCase()

  if (/stempel|stamp/.test(lower)) {
    return "star"
  }

  if (/rabatt|discount|%|€|euro/.test(lower)) {
    return "percent"
  }

  return "gift"
}

function rewardImageForStamp(
  partner: PartnerWithDeals,
  config: MicrositeConfig,
  milestone: PartnerRewardMilestone,
) {
  const rewardLabel = micrositeStampRewardTitle(milestone, config.language).toLowerCase()
  const menuItems = menuItemsForPartner(partner)
  const isDoenerReward = /döner|doener|doner|kebab/.test(rewardLabel)
  const isDrinkReward = /getränk|drink|ayran|cola|wasser|saft|limonade/.test(
    rewardLabel,
  )
  const isNonItemReward =
    /bonusstempel|bonus stamp|stempelbonus|rabatt|discount|cashback|punkte|points|guthaben/.test(
      rewardLabel,
    )

  if (isNonItemReward) {
    return ""
  }

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

  return ""
}

function menuFiltersForItems(
  items: MicrositeMenuItem[],
  language: MicrositeConfig["language"] = "de",
): MenuFilter[] {
  const categoryNames = Array.from(
    new Set(items.map((item) => item.categoryName).filter(Boolean)),
  ) as string[]

  return [
    {
      id: "all",
      label: language === "en" ? "All" : "Alle",
      predicate: () => true,
    },
    {
      id: "food",
      label: language === "en" ? "All food" : "Alle Speisen",
      predicate: (item) => !isDrinkItem(item),
    },
    {
      id: "drinks",
      label: language === "en" ? "All drinks" : "Alle Getränke",
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

function formatAddonDescription(value: string) {
  return value
    .replace(/^Size\s*\(Required\)$/i, "Größe (Pflichtauswahl)")
    .replace(/^Size$/i, "Größe")
    .replace(/\bRequired\b/gi, "Pflichtauswahl")
}

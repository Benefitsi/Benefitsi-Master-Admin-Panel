"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import type { PartnerWithDeals } from "@/lib/admin-data"
import type { MicrositeConfig } from "@/lib/microsites"
import type {
  PrintableFormatId,
  PrintableTemplateId,
} from "@/lib/microsite-personalization"

const printableFormats: Array<{
  id: PrintableFormatId
  label: string
  size: string
  aspectRatio: string
  width: number
  height: number
}> = [
  { id: "flyer-a5", label: "A5 Flyer", size: "148 x 210 mm", aspectRatio: "148 / 210", width: 1480, height: 2100 },
  { id: "poster-a4", label: "A4 Poster", size: "210 x 297 mm", aspectRatio: "210 / 297", width: 2100, height: 2970 },
  { id: "square-post", label: "Square Post", size: "1080 x 1080 px", aspectRatio: "1 / 1", width: 1080, height: 1080 },
  { id: "story-banner", label: "Story Banner", size: "1080 x 1920 px", aspectRatio: "1080 / 1920", width: 1080, height: 1920 },
  { id: "landscape-banner", label: "Landscape Banner", size: "1200 x 628 px", aspectRatio: "1200 / 628", width: 1200, height: 628 },
]

const printableTemplates: Array<{
  id: PrintableTemplateId
  label: string
  description: string
}> = [
  {
    id: "bold-offer",
    label: "Bold Offer",
    description: "Large offer-led flyer layout with a clear CTA and strong hero image.",
  },
  {
    id: "clean-story",
    label: "Clean Story",
    description: "Airy editorial layout with premium spacing for calm and trusted brands.",
  },
  {
    id: "photo-spotlight",
    label: "Photo Spotlight",
    description: "Image-first composition with the message anchored in the lower third.",
  },
  {
    id: "editorial-luxe",
    label: "Editorial Luxe",
    description: "Boutique studio composition with a framed center story and luxury tone.",
  },
  {
    id: "midnight-glow",
    label: "Midnight Glow",
    description: "High-contrast event poster with neon energy and a dramatic headline stack.",
  },
]

type PrintableTheme = ReturnType<typeof printableTheme>

function inferPrintableProfile(partner: PartnerWithDeals) {
  const signals = [
    partner.type,
    partner.description,
    partner.city_name,
    ...(partner.category ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (/(doner|d[oö]ner|pizza|restaurant|cafe|coffee|burger|food|bar)/.test(signals)) {
    return {
      label: "Food & drink",
      note: "Lead with appetite, pace, and one clear reason to walk in now.",
      recommendedFormat: "flyer-a5" as PrintableFormatId,
      recommendedTemplate: "photo-spotlight" as PrintableTemplateId,
    }
  }

  if (/(hair|salon|barber|beauty|nail)/.test(signals)) {
    return {
      label: "Salon & beauty",
      note: "Use premium spacing, polished typography, and service-led framing.",
      recommendedFormat: "square-post" as PrintableFormatId,
      recommendedTemplate: "editorial-luxe" as PrintableTemplateId,
    }
  }

  if (/(massage|spa|wellness|therapy|yoga|fitness)/.test(signals)) {
    return {
      label: "Wellness & care",
      note: "Keep the message calm, breathable, and easy to scan from a distance.",
      recommendedFormat: "story-banner" as PrintableFormatId,
      recommendedTemplate: "clean-story" as PrintableTemplateId,
    }
  }

  if (/(cinema|movie|event|club|music)/.test(signals)) {
    return {
      label: "Entertainment",
      note: "Use dramatic contrast and a poster-like hierarchy that feels event-driven.",
      recommendedFormat: "poster-a4" as PrintableFormatId,
      recommendedTemplate: "midnight-glow" as PrintableTemplateId,
    }
  }

  return {
    label: "Retail & services",
    note: "Balance offer clarity with a polished local-brand presentation.",
    recommendedFormat: "landscape-banner" as PrintableFormatId,
    recommendedTemplate: "bold-offer" as PrintableTemplateId,
  }
}

function buildPrintablePartnerFacts(
  partner: PartnerWithDeals,
  config: MicrositeConfig,
) {
  const categoryLine =
    partner.category?.filter(Boolean).join(" | ") ||
    partner.type?.trim() ||
    "Local partner"
  const detailLine = [
    partner.city_name?.trim(),
    config.hero.locationText?.trim(),
    partner.phone?.trim(),
    trimWebsite(partner.website),
  ]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 3)
    .join(" | ")

  return {
    categoryLine,
    detailLine,
  }
}

function trimWebsite(value: string | null | undefined) {
  return (value || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .trim()
}

export function PrintableStudioPanel({
  partner,
  config,
  setConfig,
  tr,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
  tr: (text: string) => string
}) {
  const previewViewportRef = useRef<HTMLDivElement | null>(null)
  const [previewViewportWidth, setPreviewViewportWidth] = useState(0)
  const activeFormat =
    printableFormats.find((format) => format.id === config.printables.activeFormat) ??
    printableFormats[0]
  const activeTemplate =
    printableTemplates.find((template) => template.id === config.printables.activeTemplate) ??
    printableTemplates[0]
  const printableProfile = useMemo(() => inferPrintableProfile(partner), [partner])
  const previewImage =
    config.deals.topDealImageUrl ||
    config.hero.backgroundImageUrl ||
    partner.feature_card_url ||
    partner.cover_urls?.[0] ||
    "/upload-image.jpg"

  const printableMarkup = useMemo(
    () => buildPrintableMarkup(partner, config, activeFormat, activeTemplate, previewImage, "window"),
    [activeFormat, activeTemplate, config, partner, previewImage],
  )
  const embeddedPrintableMarkup = useMemo(
    () => buildPrintableMarkup(partner, config, activeFormat, activeTemplate, previewImage, "embedded"),
    [activeFormat, activeTemplate, config, partner, previewImage],
  )
  const previewCanvasWidth = 900
  const previewCanvasHeight = Math.round((previewCanvasWidth * activeFormat.height) / activeFormat.width)
  const previewScale =
    previewViewportWidth > 0 ? Math.min(previewViewportWidth / previewCanvasWidth, 1) : 1
  const hasMeasuredPreviewViewport = previewViewportWidth > 0

  useEffect(() => {
    const viewport = previewViewportRef.current

    if (!viewport) {
      return
    }

    const syncWidth = () => {
      setPreviewViewportWidth(viewport.clientWidth)
    }

    syncWidth()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth)
      return () => window.removeEventListener("resize", syncWidth)
    }

    const observer = new ResizeObserver(() => {
      syncWidth()
    })

    observer.observe(viewport)

    return () => observer.disconnect()
  }, [])

  function updatePrintables(
    patch: Partial<MicrositeConfig["printables"]>,
  ) {
    setConfig((current) => ({
      ...current,
      printables: {
        ...current.printables,
        ...patch,
      },
    }))
  }

  function openPrintableWindow(autoPrint: boolean) {
    const popup = window.open("", "_blank", "width=1200,height=900,resizable=yes,scrollbars=yes")

    if (!popup) {
      return
    }

    popup.document.open()
    popup.document.write(printableMarkup)
    popup.document.close()
    popup.focus()

    if (autoPrint) {
      const triggerPrint = () => {
        popup.focus()
        popup.print()
      }

      popup.onload = () => {
        window.setTimeout(triggerPrint, 180)
      }
      window.setTimeout(triggerPrint, 600)
    }
  }

  return (
    <div className="min-w-0 space-y-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-4">
      <div className="grid min-w-0 gap-4">
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              Recommended direction
            </p>
            <p className="mt-2 text-sm font-black text-zinc-950">{printableProfile.label}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-600">{printableProfile.note}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              {tr("Formate")}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {printableFormats.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => updatePrintables({ activeFormat: format.id })}
                  className={`rounded-xl border p-3 text-left transition ${
                    config.printables.activeFormat === format.id
                      ? "border-teal-400 bg-teal-50"
                      : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-black text-zinc-950">
                    <span>{format.label}</span>
                    {format.id === printableProfile.recommendedFormat ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-teal-700">
                        Best fit
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">{format.size}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              {tr("Designs")}
            </p>
            <div className="mt-2 grid gap-2">
              {printableTemplates.map((template) => {
                const cardTheme = printableTheme(template.id)

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => updatePrintables({ activeTemplate: template.id })}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      config.printables.activeTemplate === template.id
                        ? "border-teal-400 bg-teal-50"
                        : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white"
                    }`}
                  >
                    <div className={`overflow-hidden rounded-lg border p-2 ${cardTheme.selectorFrameClass}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${cardTheme.selectorBadgeClass}`}>
                          {cardTheme.selectorLabel}
                        </span>
                        <span className={`size-5 rounded-full ${cardTheme.selectorOrbClass}`} />
                      </div>
                      <div className={`mt-2 rounded-[0.95rem] ${cardTheme.selectorHeroClass}`} />
                      <div className="mt-2 grid grid-cols-[1fr_58px] gap-2">
                        <div className={`h-2.5 rounded-full ${cardTheme.selectorLineStrongClass}`} />
                        <div className={`h-2.5 rounded-full ${cardTheme.selectorLineSoftClass}`} />
                      </div>
                    </div>
                    <span className="mt-2.5 flex flex-wrap items-center gap-2 text-sm font-black text-zinc-950">
                      <span>{template.label}</span>
                      {template.id === printableProfile.recommendedTemplate ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-teal-700">
                          Best fit
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      {cardTheme.layoutLabel}
                    </span>
                    <span className="mt-1 block text-[11px] leading-5 text-zinc-500">
                      {template.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid min-w-0 gap-3">
            <PrintField
              label={tr("Headline")}
              value={config.printables.headline}
              onChange={(value) => updatePrintables({ headline: value })}
            />
            <PrintField
              label={tr("Subheadline")}
              value={config.printables.subheadline}
              onChange={(value) => updatePrintables({ subheadline: value })}
              multiline
            />
            <PrintField
              label={tr("CTA")}
              value={config.printables.cta}
              onChange={(value) => updatePrintables({ cta: value })}
            />
            <PrintField
              label={tr("Hinweis")}
              value={config.printables.note}
              onChange={(value) => updatePrintables({ note: value })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openPrintableWindow(false)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50"
            >
              {tr("Print-Vorschau öffnen")}
            </button>
            <button
              type="button"
              onClick={() => openPrintableWindow(true)}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
            >
              {tr("Jetzt drucken")}
            </button>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-[1.4rem] border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-zinc-950">{activeFormat.label}</p>
              <p className="text-xs text-zinc-500">{activeFormat.size}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              {activeTemplate.label}
            </span>
          </div>
          <div className="mx-auto w-full max-w-[300px] sm:max-w-[348px]">
            <div className="rounded-[1.8rem] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,.10)]">
              <div
                ref={previewViewportRef}
                className="overflow-hidden rounded-[1.45rem] bg-white"
                style={{ aspectRatio: activeFormat.aspectRatio }}
              >
                {hasMeasuredPreviewViewport ? (
                  <div
                    className="block origin-top-left"
                    style={{
                      width: previewCanvasWidth,
                      height: previewCanvasHeight,
                      transform: `scale(${previewScale})`,
                    }}
                  >
                    <iframe
                      title={`${activeTemplate.label} preview`}
                      srcDoc={embeddedPrintableMarkup}
                      className="block border-0 bg-white"
                      style={{
                        width: previewCanvasWidth,
                        height: previewCanvasHeight,
                      }}
                      scrolling="no"
                    />
                  </div>
                ) : (
                  <iframe
                    title={`${activeTemplate.label} preview`}
                    srcDoc={embeddedPrintableMarkup}
                    className="block h-full w-full border-0 bg-white"
                    scrolling="no"
                  />
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {activeFormat.id === "flyer-a5" || activeFormat.id === "poster-a4"
              ? "Ideal for counter flyers, posters, and printable handouts."
              : activeFormat.id === "story-banner"
                ? "Ideal for mobile stories and vertical lobby screens."
                : "Ideal for social posts, partner banners, and promo tiles."}
          </p>
        </div>
      </div>
    </div>
  )
}

function PrintField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  const baseClasses =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"

  return (
    <label className="block min-w-0 space-y-1.5 text-xs font-medium text-zinc-600">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${baseClasses} min-h-24 py-2`}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${baseClasses} h-10`}
        />
      )}
    </label>
  )
}

function printableTheme(template: PrintableTemplateId) {
  if (template === "clean-story") {
    return {
      layout: "clean-story" as const,
      layoutLabel: "Editorial split",
      selectorLabel: "Serene",
      selectorFrameClass: "border-emerald-200 bg-[#edf7f1]",
      selectorBadgeClass: "bg-white text-emerald-700",
      selectorOrbClass: "bg-emerald-300/90",
      selectorHeroClass: "h-14 bg-[linear-gradient(135deg,#d1fae5_0%,#f8fafc_100%)]",
      selectorLineStrongClass: "bg-emerald-700/75",
      selectorLineSoftClass: "bg-sky-300/80",
      previewSurfaceClass: "bg-[#f4efe8]",
      previewImageClass: "opacity-15",
      previewOverlayClass: "bg-[linear-gradient(180deg,rgba(244,239,232,.92)_0%,rgba(244,239,232,.82)_100%)]",
      previewTextClass: "text-zinc-950",
      eyebrowClass: "border border-zinc-900/10 bg-zinc-900/5 text-zinc-700",
      bodyClass: "text-zinc-700",
      ctaClass: "bg-zinc-950 text-white",
      noteClass: "text-zinc-600",
      metaLabelClass: "text-zinc-500",
      metaTextClass: "text-zinc-700",
      cardClass: "border-zinc-900/10 bg-white/78",
      frameClass: "border-white/70 bg-white/45",
      textColor: "#111827",
      ctaBackground: "#111827",
      ctaColor: "#ffffff",
      overlayCss: "linear-gradient(180deg, rgba(244,239,232,.92) 0%, rgba(244,239,232,.82) 100%)",
      imageOpacity: ".15",
      factsBorder: "rgba(17,24,39,.08)",
      factsBackground: "rgba(255,255,255,.78)",
      eyebrowBorder: "rgba(17,24,39,.10)",
      eyebrowBackground: "rgba(17,24,39,.05)",
      eyebrowColor: "#374151",
    }
  }

  if (template === "photo-spotlight") {
    return {
      layout: "photo-spotlight" as const,
      layoutLabel: "Bottom spotlight",
      selectorLabel: "Image-led",
      selectorFrameClass: "border-zinc-300 bg-[#111827]",
      selectorBadgeClass: "bg-white/12 text-white",
      selectorOrbClass: "bg-white/30",
      selectorHeroClass: "h-14 bg-[linear-gradient(135deg,#111827_0%,#7f1d1d_100%)]",
      selectorLineStrongClass: "bg-white/90",
      selectorLineSoftClass: "bg-rose-300/80",
      previewSurfaceClass: "bg-zinc-950",
      previewImageClass: "opacity-72",
      previewOverlayClass: "bg-[linear-gradient(180deg,rgba(0,0,0,.08)_0%,rgba(0,0,0,.34)_42%,rgba(0,0,0,.82)_100%)]",
      previewTextClass: "text-white",
      eyebrowClass: "border border-white/25 bg-white/10 text-white",
      bodyClass: "text-white/88",
      ctaClass: "bg-white text-zinc-950",
      noteClass: "text-white/82",
      metaLabelClass: "text-white/68",
      metaTextClass: "text-white/88",
      cardClass: "border-white/15 bg-white/10",
      frameClass: "border-white/12 bg-white/4",
      textColor: "#ffffff",
      ctaBackground: "#ffffff",
      ctaColor: "#111827",
      overlayCss: "linear-gradient(180deg, rgba(0,0,0,.08) 0%, rgba(0,0,0,.34) 42%, rgba(0,0,0,.82) 100%)",
      imageOpacity: ".72",
      factsBorder: "rgba(255,255,255,.15)",
      factsBackground: "rgba(255,255,255,.10)",
      eyebrowBorder: "rgba(255,255,255,.25)",
      eyebrowBackground: "rgba(255,255,255,.10)",
      eyebrowColor: "#ffffff",
    }
  }

  if (template === "editorial-luxe") {
    return {
      layout: "editorial-luxe" as const,
      layoutLabel: "Framed editorial",
      selectorLabel: "Luxe",
      selectorFrameClass: "border-amber-300 bg-[#17131c]",
      selectorBadgeClass: "bg-white/10 text-amber-100",
      selectorOrbClass: "bg-rose-300/80",
      selectorHeroClass: "h-14 bg-[linear-gradient(135deg,#18111b_0%,#563144_54%,#f59e0b_100%)]",
      selectorLineStrongClass: "bg-amber-200/90",
      selectorLineSoftClass: "bg-rose-300/80",
      previewSurfaceClass: "bg-[#18111b]",
      previewImageClass: "opacity-16",
      previewOverlayClass: "bg-[linear-gradient(150deg,rgba(24,17,27,.94)_0%,rgba(61,31,46,.74)_48%,rgba(245,158,11,.24)_100%)]",
      previewTextClass: "text-[#fff7ed]",
      eyebrowClass: "border border-white/12 bg-white/8 text-amber-100",
      bodyClass: "text-amber-50/86",
      ctaClass: "bg-amber-300 text-[#1f1724]",
      noteClass: "text-amber-100/80",
      metaLabelClass: "text-rose-100/70",
      metaTextClass: "text-amber-50/86",
      cardClass: "border-white/12 bg-white/8",
      frameClass: "border-amber-300/45 bg-black/12",
      textColor: "#fff7ed",
      ctaBackground: "#fcd34d",
      ctaColor: "#1f1724",
      overlayCss: "linear-gradient(150deg, rgba(24,17,27,.94) 0%, rgba(61,31,46,.74) 48%, rgba(245,158,11,.24) 100%)",
      imageOpacity: ".16",
      factsBorder: "rgba(255,255,255,.12)",
      factsBackground: "rgba(255,255,255,.08)",
      eyebrowBorder: "rgba(255,255,255,.12)",
      eyebrowBackground: "rgba(255,255,255,.08)",
      eyebrowColor: "#fde68a",
    }
  }

  if (template === "midnight-glow") {
    return {
      layout: "midnight-glow" as const,
      layoutLabel: "Neon poster",
      selectorLabel: "Event",
      selectorFrameClass: "border-cyan-300 bg-[#07111f]",
      selectorBadgeClass: "bg-white/10 text-cyan-100",
      selectorOrbClass: "bg-cyan-300/85",
      selectorHeroClass: "h-14 bg-[linear-gradient(135deg,#07111f_0%,#2563eb_42%,#22d3ee_70%,#f43f5e_100%)]",
      selectorLineStrongClass: "bg-cyan-300/90",
      selectorLineSoftClass: "bg-rose-300/80",
      previewSurfaceClass: "bg-[#07111f]",
      previewImageClass: "opacity-24",
      previewOverlayClass: "bg-[linear-gradient(145deg,rgba(7,17,31,.95)_0%,rgba(37,99,235,.56)_40%,rgba(34,211,238,.28)_68%,rgba(244,63,94,.42)_100%)]",
      previewTextClass: "text-white",
      eyebrowClass: "border border-cyan-300/22 bg-cyan-300/10 text-cyan-100",
      bodyClass: "text-cyan-100/88",
      ctaClass: "bg-cyan-300 text-[#07111f]",
      noteClass: "text-cyan-100/78",
      metaLabelClass: "text-rose-200/74",
      metaTextClass: "text-cyan-100/86",
      cardClass: "border-cyan-300/16 bg-white/8",
      frameClass: "border-cyan-300/14 bg-black/8",
      textColor: "#ffffff",
      ctaBackground: "#67e8f9",
      ctaColor: "#07111f",
      overlayCss: "linear-gradient(145deg, rgba(7,17,31,.95) 0%, rgba(37,99,235,.56) 40%, rgba(34,211,238,.28) 68%, rgba(244,63,94,.42) 100%)",
      imageOpacity: ".24",
      factsBorder: "rgba(103,232,249,.14)",
      factsBackground: "rgba(255,255,255,.08)",
      eyebrowBorder: "rgba(103,232,249,.22)",
      eyebrowBackground: "rgba(103,232,249,.10)",
      eyebrowColor: "#cffafe",
    }
  }

  return {
    layout: "bold-offer" as const,
    layoutLabel: "Offer stack",
    selectorLabel: "Promo",
    selectorFrameClass: "border-amber-200 bg-[#fffbeb]",
    selectorBadgeClass: "bg-white text-amber-700",
    selectorOrbClass: "bg-cyan-400/80",
    selectorHeroClass: "h-14 bg-[linear-gradient(135deg,#f59e0b_0%,#f97316_46%,#16c4cc_100%)]",
    selectorLineStrongClass: "bg-amber-700/85",
    selectorLineSoftClass: "bg-cyan-400/80",
    previewSurfaceClass: "bg-zinc-950",
    previewImageClass: "opacity-28",
    previewOverlayClass: "bg-[linear-gradient(140deg,rgba(0,0,0,.84)_0%,rgba(0,0,0,.58)_36%,rgba(225,29,72,.54)_100%)]",
    previewTextClass: "text-white",
    eyebrowClass: "border border-white/25 bg-white/12 text-white",
    bodyClass: "text-white/88",
    ctaClass: "bg-white text-zinc-950",
    noteClass: "text-white/82",
    metaLabelClass: "text-white/68",
    metaTextClass: "text-white/88",
    cardClass: "border-white/15 bg-white/10",
    frameClass: "border-white/12 bg-black/8",
    textColor: "#ffffff",
    ctaBackground: "#ffffff",
    ctaColor: "#111827",
    overlayCss: "linear-gradient(140deg, rgba(0,0,0,.84) 0%, rgba(0,0,0,.58) 36%, rgba(225,29,72,.54) 100%)",
    imageOpacity: ".28",
    factsBorder: "rgba(255,255,255,.15)",
    factsBackground: "rgba(255,255,255,.10)",
    eyebrowBorder: "rgba(255,255,255,.25)",
    eyebrowBackground: "rgba(255,255,255,.12)",
    eyebrowColor: "#ffffff",
  }
}

function buildPrintableMarkup(
  partner: PartnerWithDeals,
  config: MicrositeConfig,
  activeFormat: (typeof printableFormats)[number],
  activeTemplate: (typeof printableTemplates)[number],
  previewImage: string,
  mode: "window" | "embedded",
) {
  const isEmbedded = mode === "embedded"
  const escapedHeadline = escapeHtml(config.printables.headline)
  const escapedSubheadline = escapeHtml(config.printables.subheadline)
  const escapedCta = escapeHtml(config.printables.cta)
  const escapedNote = escapeHtml(config.printables.note)
  const escapedPartner = escapeHtml(partner.name || config.hero.headline)
  const partnerFacts = buildPrintablePartnerFacts(partner, config)
  const escapedCategoryLine = escapeHtml(partnerFacts.categoryLine)
  const escapedDetailLine = escapeHtml(partnerFacts.detailLine)
  const theme = printableTheme(activeTemplate.id)
  const printPageSize =
    activeFormat.id === "flyer-a5"
      ? "148mm 210mm"
      : activeFormat.id === "poster-a4"
        ? "210mm 297mm"
        : "auto"

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedHeadline} | ${escapedPartner}</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: ${isEmbedded ? "#ffffff" : "#f4f4f5"};
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        min-height: 100vh;
        overflow: hidden;
        ${isEmbedded ? "display: block;" : "display: grid; place-items: center; padding: 24px;"}
      }
      .sheet {
        position: relative;
        width: ${isEmbedded ? "100vw" : "min(100%, 900px)"};
        ${isEmbedded ? "height: 100vh;" : `aspect-ratio: ${activeFormat.aspectRatio};`}
        overflow: hidden;
        border-radius: ${isEmbedded ? "0" : "28px"};
        color: ${theme.textColor};
        background: #111827;
        box-shadow: ${isEmbedded ? "none" : "0 30px 90px rgba(15, 23, 42, 0.24)"};
      }
      .image {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: ${theme.imageOpacity};
      }
      .overlay {
        position: absolute;
        inset: 0;
        background: ${theme.overlayCss};
      }
      .stage {
        position: relative;
        z-index: 1;
        height: 100%;
        padding: clamp(24px, 4vw, 44px);
      }
      .eyebrow {
        display: inline-flex;
        width: fit-content;
        border: 1px solid ${theme.eyebrowBorder};
        background: ${theme.eyebrowBackground};
        color: ${theme.eyebrowColor};
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .title {
        margin: 0;
        font-size: clamp(34px, 6vw, 76px);
        line-height: .92;
        letter-spacing: -.06em;
        font-weight: 900;
        overflow-wrap: anywhere;
      }
      .body {
        margin: 0;
        font-size: clamp(15px, 1.8vw, 22px);
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      .cta {
        display: inline-flex;
        width: fit-content;
        max-width: 100%;
        border-radius: 999px;
        background: ${theme.ctaBackground};
        color: ${theme.ctaColor};
        padding: 14px 18px;
        font-size: clamp(14px, 1.4vw, 18px);
        font-weight: 800;
        overflow-wrap: anywhere;
      }
      .card {
        border: 1px solid ${theme.factsBorder};
        background: ${theme.factsBackground};
        backdrop-filter: blur(12px);
      }
      .facts-label {
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .16em;
        text-transform: uppercase;
        opacity: .7;
      }
      .facts-line {
        font-size: 12px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      .clean-story {
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      .clean-story-main {
        display: flex;
        align-items: center;
      }
      .clean-story-card {
        width: 100%;
        border-radius: 24px;
        padding: 22px;
      }
      .clean-story-footer {
        display: grid;
        gap: 14px;
      }
      .photo-spotlight {
        display: flex;
        align-items: end;
      }
      .photo-spotlight-card {
        width: 100%;
        border-radius: 26px;
        padding: 22px;
      }
      .photo-spotlight-row {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 14px;
        margin-top: 18px;
      }
      .editorial-luxe {
        position: relative;
        display: flex;
        align-items: stretch;
        justify-content: center;
        text-align: center;
      }
      .editorial-luxe::before {
        content: "";
        position: absolute;
        inset: clamp(20px, 4vw, 34px);
        border-radius: 30px;
        border: 1px solid rgba(252,211,77,.32);
      }
      .editorial-luxe-column {
        position: relative;
        z-index: 1;
        display: flex;
        height: 100%;
        width: min(100%, 520px);
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }
      .editorial-luxe-card {
        width: 100%;
        border-radius: 24px;
        padding: 18px;
      }
      .midnight-glow {
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      .midnight-glow-top {
        display: flex;
        justify-content: space-between;
        gap: 14px;
      }
      .midnight-glow-headline {
        display: flex;
        align-items: center;
      }
      .midnight-glow-stack {
        max-width: 11ch;
      }
      .midnight-glow-footer {
        width: fit-content;
        max-width: 100%;
        border-radius: 24px;
        padding: 16px 18px;
      }
      .bold-offer {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .bold-offer-footer {
        display: grid;
        gap: 14px;
      }
      .bold-offer-card {
        border-radius: 24px;
        padding: 16px 18px;
      }
      @media print {
        @page {
          size: ${printPageSize};
          margin: 0;
        }
        body {
          background: white;
          padding: 0;
        }
        .sheet {
          width: 100vw;
          height: 100vh;
          border-radius: 0;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <section class="sheet" aria-label="${escapedPartner} printable asset">
      <img class="image" src="${escapeAttribute(previewImage)}" alt="" />
      <div class="overlay"></div>
      ${buildPrintableMarkupContent(theme, {
        headline: escapedHeadline,
        subheadline: escapedSubheadline,
        cta: escapedCta,
        note: escapedNote,
        categoryLine: escapedCategoryLine,
        detailLine: escapedDetailLine,
      })}
    </section>
  </body>
</html>`
}

function buildPrintableMarkupContent(
  theme: PrintableTheme,
  content: {
    headline: string
    subheadline: string
    cta: string
    note: string
    categoryLine: string
    detailLine: string
  },
) {
  const detailMarkup = content.detailLine
    ? `<p class="facts-line" style="margin:6px 0 0;">${content.detailLine}</p>`
    : ""

  if (theme.layout === "clean-story") {
    return `
      <div class="stage clean-story">
        <span class="eyebrow">Benefitsi Partner</span>
        <div class="clean-story-main">
          <div class="card clean-story-card">
            <h1 class="title" style="max-width:9ch;">${content.headline}</h1>
            <p class="body" style="max-width:24ch;margin-top:16px;">${content.subheadline}</p>
          </div>
        </div>
        <div class="clean-story-footer">
          <span class="cta">${content.cta}</span>
          <div class="card clean-story-card" style="padding:16px 18px;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.82;">${content.note}</p>
            <p class="facts-label" style="margin:10px 0 0;">${content.categoryLine}</p>
            ${detailMarkup}
          </div>
        </div>
      </div>
    `
  }

  if (theme.layout === "photo-spotlight") {
    return `
      <div class="stage photo-spotlight">
        <div class="card photo-spotlight-card">
          <span class="eyebrow">Benefitsi Partner</span>
          <h1 class="title" style="max-width:9ch;margin-top:18px;">${content.headline}</h1>
          <p class="body" style="max-width:24ch;margin-top:16px;">${content.subheadline}</p>
          <div class="photo-spotlight-row">
            <span class="cta">${content.cta}</span>
            <div>
              <p class="facts-label" style="margin:0;">${content.categoryLine}</p>
              <p class="facts-line" style="margin:6px 0 0;">${content.note}</p>
            </div>
          </div>
        </div>
      </div>
    `
  }

  if (theme.layout === "editorial-luxe") {
    return `
      <div class="stage editorial-luxe">
        <div class="editorial-luxe-column">
          <span class="eyebrow" style="margin-top:8px;">Benefitsi Partner</span>
          <div>
            <h1 class="title" style="max-width:9ch;margin:0 auto;">${content.headline}</h1>
            <p class="body" style="max-width:22ch;margin:16px auto 0;">${content.subheadline}</p>
          </div>
          <div class="card editorial-luxe-card">
            <span class="cta">${content.cta}</span>
            <p style="margin:14px 0 0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.82;">${content.note}</p>
            <p class="facts-label" style="margin:10px 0 0;">${content.categoryLine}</p>
          </div>
        </div>
      </div>
    `
  }

  if (theme.layout === "midnight-glow") {
    return `
      <div class="stage midnight-glow">
        <div class="midnight-glow-top">
          <span class="eyebrow">Benefitsi Partner</span>
          <span class="cta" style="max-width:46%;padding:10px 14px;font-size:14px;">${content.cta}</span>
        </div>
        <div class="midnight-glow-headline">
          <div class="midnight-glow-stack">
            <h1 class="title">${content.headline}</h1>
            <p class="body" style="margin-top:16px;">${content.subheadline}</p>
          </div>
        </div>
        <div class="card midnight-glow-footer">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.82;">${content.note}</p>
          <p class="facts-label" style="margin:10px 0 0;">${content.categoryLine}</p>
        </div>
      </div>
    `
  }

  return `
    <div class="stage bold-offer">
      <div>
        <span class="eyebrow">Benefitsi Partner</span>
        <h1 class="title" style="max-width:10ch;margin-top:18px;">${content.headline}</h1>
        <p class="body" style="max-width:24ch;margin-top:16px;">${content.subheadline}</p>
      </div>
      <div class="bold-offer-footer">
        <span class="cta">${content.cta}</span>
        <div class="card bold-offer-card">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.82;">${content.note}</p>
          <p class="facts-label" style="margin:10px 0 0;">${content.categoryLine}</p>
          ${detailMarkup}
        </div>
      </div>
    </div>
  `
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttribute(value: string) {
  return escapeHtml(value)
}

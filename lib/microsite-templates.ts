import { createDefaultMicrositeConfig, type MicrositeConfig } from "./microsites"
import type { MicrositeTemplateId } from "./microsite-personalization"
import { categoryMicrositeThemes, type CategoryMicrositeTemplateId, themeText } from "./microsite-category-themes"

export type MicrositeTemplatePreset = {
  id: MicrositeTemplateId
  name: string
  description: string
  accent: string
  accentSecondary: string
}

export const micrositeTemplatePresets: MicrositeTemplatePreset[] = [
  {
    id: "restaurant-premium",
    name: "Food & Drink · Original",
    description:
      "Responsive Partnerseite mit logo-basierter 3-Farben-Identität, Benefits, Loyalty und lokaler Story.",
    accent: "#118cff",
    accentSecondary: "#061829",
  },
  ...Object.entries(categoryMicrositeThemes).map(([id, theme]) => ({
    id: id as CategoryMicrositeTemplateId,
    name: theme.name,
    description: theme.description[0],
    accent: theme.accent,
    accentSecondary: theme.secondary,
  })),
]

export function applyMicrositeTemplatePreset(
  config: MicrositeConfig,
  templateId: MicrositeTemplatePreset["id"],
  partner?: Parameters<typeof createDefaultMicrositeConfig>[0],
): MicrositeConfig {
  const preset = micrositeTemplatePresets.find((item) => item.id === templateId)

  if (!preset) {
    return config
  }

  if (!partner || templateId === config.template) return { ...config, template: templateId }
  const previous = templateDefaults(partner, config.template, config.language)
  const next = templateDefaults(partner, templateId, config.language)
  // Only replace generated defaults. Partner images, custom copy, element edits,
  // QA state and published versions remain under the admin's control.
  const mergeDefaults = <T extends object>(current: T, before: T, after: T): T =>
    Object.fromEntries(Object.entries(current).map(([key, value]) => [key,
      JSON.stringify(value) === JSON.stringify(before[key as keyof T]) ? after[key as keyof T] : value,
    ])) as T
  return {
    ...config,
    template: templateId,
    hero: mergeDefaults(config.hero, previous.hero, next.hero),
    content: mergeDefaults(config.content, previous.content, next.content),
    deals: mergeDefaults(config.deals, previous.deals, next.deals),
    seo: mergeDefaults(config.seo, previous.seo, next.seo),
    branding: config.branding.paletteMode === "auto" ? mergeDefaults(config.branding, previous.branding, next.branding) : config.branding,
    navigation: { links: config.navigation.links.map((link) => link.anchor === "speisekarte" && link.label === previous.content.menuLabel ? { ...link, label: next.content.menuLabel } : link) },
  }
}

export function templateDefaults(partner: Parameters<typeof createDefaultMicrositeConfig>[0], template: MicrositeTemplateId, language: MicrositeConfig["language"] = "de"): MicrositeConfig {
  return createDefaultMicrositeConfig(partner, template, language)
}

export function micrositeTemplateDescription(template: MicrositeTemplateId, language: "de" | "en") {
  return template === "restaurant-premium"
    ? (language === "en" ? "The original Food & Drink template, preserved for restaurants, cafés and bars." : "Die bestehende Food & Drink Vorlage für Restaurants, Cafés und Bars bleibt erhalten.")
    : themeText(categoryMicrositeThemes[template].description, language)
}

import type { MicrositeConfig } from "./microsites"

export type MicrositeTemplatePreset = {
  id: "restaurant-premium" | "restaurant-local" | "restaurant-clean"
  name: string
  description: string
  accent: string
  accentSecondary: string
}

export const micrositeTemplatePresets: MicrositeTemplatePreset[] = [
  {
    id: "restaurant-premium",
    name: "Restaurant Premium",
    description: "Emotionaler Hero, Deals, Stempelkarte, App-Banner und starke lokale Story.",
    accent: "#f59e0b",
    accentSecondary: "#16c4cc",
  },
  {
    id: "restaurant-local",
    name: "Local Restaurant",
    description: "Ruhiger, regionaler Auftritt für Restaurants, Cafés und lokale Gastgeber.",
    accent: "#d97706",
    accentSecondary: "#0ea5e9",
  },
  {
    id: "restaurant-clean",
    name: "Clean Food Page",
    description: "Klarer, reduzierter Aufbau für schnelle Partnerseiten mit wenig Bildmaterial.",
    accent: "#111827",
    accentSecondary: "#14b8a6",
  },
]

export function applyMicrositeTemplatePreset(
  config: MicrositeConfig,
  templateId: MicrositeTemplatePreset["id"],
): MicrositeConfig {
  const preset = micrositeTemplatePresets.find((item) => item.id === templateId)

  if (!preset) {
    return config
  }

  return {
    ...config,
    template: "restaurant-premium",
    branding: {
      ...config.branding,
      accent: preset.accent,
      accentSecondary: preset.accentSecondary,
    },
    content: {
      ...config.content,
      menuHeadline:
        templateId === "restaurant-clean"
          ? "Speisekarte schnell entdecken."
          : config.content.menuHeadline,
      aboutHeadline:
        templateId === "restaurant-local"
          ? "Regional. Persönlich. Mit Liebe gemacht."
          : config.content.aboutHeadline,
    },
  }
}

import type { MicrositeConfig } from "./microsites"
import type { MicrositeTemplateId } from "./microsite-personalization"

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
    name: "Restaurant Premium",
    description: "Emotionaler Hero, Deals, Stempelkarte, App-Banner und starke lokale Story.",
    accent: "#f59e0b",
    accentSecondary: "#16c4cc",
  },
  {
    id: "restaurant-local",
    name: "Local Restaurant",
    description: "Ruhiger, regionaler Auftritt für Restaurants, Cafes und lokale Gastgeber.",
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
  {
    id: "salon-editorial",
    name: "Salon Editorial",
    description: "Magazinartiger Look für Hair, Beauty und Service-Studios mit Fokus auf Treatments.",
    accent: "#b45309",
    accentSecondary: "#fb7185",
  },
  {
    id: "atelier-noir",
    name: "Atelier Noir",
    description: "Dunkler Editorial-Look für Boutique-Studios, Premium-Beauty und stilvolle Services.",
    accent: "#f59e0b",
    accentSecondary: "#f9a8d4",
  },
  {
    id: "wellness-serene",
    name: "Wellness Serene",
    description: "Ruhige, hochwertige Wellness-Sprache für Massage, Spa und Regeneration.",
    accent: "#0f766e",
    accentSecondary: "#93c5fd",
  },
  {
    id: "cinema-spotlight",
    name: "Cinema Spotlight",
    description: "Kontrastreiche Event-Optik für Kino, Freizeit und erlebnisorientierte Partner.",
    accent: "#e11d48",
    accentSecondary: "#8b5cf6",
  },
  {
    id: "festival-neon",
    name: "Festival Neon",
    description: "Elektrische Nightlife-Asthetik für Events, Entertainment und laute Partner-Auftritte.",
    accent: "#22d3ee",
    accentSecondary: "#f43f5e",
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

  const menuHeadline =
    templateId === "restaurant-clean"
      ? "Speisekarte schnell entdecken."
      : templateId === "salon-editorial"
        ? "Beliebte Services direkt entdecken."
        : templateId === "atelier-noir"
          ? "Signature Services mit Premium-Appeal zeigen."
          : templateId === "wellness-serene"
            ? "Rituale und Treatments in Ruhe vergleichen."
            : templateId === "cinema-spotlight"
              ? "Events, Highlights und Bundles im Fokus."
              : templateId === "festival-neon"
                ? "Line-up, Specials und Energy sofort erfassen."
                : config.content.menuHeadline

  const aboutHeadline =
    templateId === "restaurant-local"
      ? "Regional. Persönlich. Mit Liebe gemacht."
      : templateId === "salon-editorial"
        ? "Service, Stil und Vertrauen auf einen Blick."
        : templateId === "atelier-noir"
          ? "Luxury service, detail focus, and a memorable studio mood."
          : templateId === "wellness-serene"
            ? "Ein Ort zum Abschalten und Wiederkommen."
            : templateId === "cinema-spotlight"
              ? "Mehr als ein Besuch: ein Erlebnis mit Wiederkehrfaktor."
              : templateId === "festival-neon"
                ? "Laut, lebendig und gemacht für wiederkehrende Erlebnisse."
                : config.content.aboutHeadline

  return {
    ...config,
    template: templateId,
    branding: {
      ...config.branding,
      accent: preset.accent,
      accentSecondary: preset.accentSecondary,
    },
    content: {
      ...config.content,
      menuHeadline,
      aboutHeadline,
    },
  }
}

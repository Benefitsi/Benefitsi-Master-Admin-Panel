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
    name: "Standard",
    description:
      "Responsive Partnerseite mit logo-basierter 3-Farben-Identität, Benefits, Loyalty und lokaler Story.",
    accent: "#f97316",
    accentSecondary: "#172554",
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
    template: templateId,
  }
}

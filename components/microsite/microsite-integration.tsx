"use client"

import { createContext, useContext } from "react"
import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react"

/** Public hosts supply data and actions; the Builder owns the visual sections. */
export type PublishedMicrositeBenefits = {
  label: string
  dealActions: Record<string, ReactNode>
  appAction: ReactNode
  loyalty: {
    targetCount?: number
    rewards: Array<{ id: string; requiredStamps: number; title: string; description?: string; audienceLabel: string }>
    footer: ReactNode
  } | null
}

export type MicrositeIntegration = {
  hideEmptySections?: boolean
  publishedBenefits?: PublishedMicrositeBenefits
  benefits?: ReactNode
  app?: ReactNode
  faq?: ReactNode
  beforeFooter?: ReactNode
  heroBadge?: ReactNode
  contactMap?: ReactNode
  openingHours?: ReactNode
  socialFeed?: ReactNode
  hrefOverrides?: Record<string, string>
  Link?: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>>
}

const IntegrationContext = createContext<MicrositeIntegration>({})
export const MicrositeIntegrationProvider = IntegrationContext.Provider
export function useMicrositeIntegration() { return useContext(IntegrationContext) }

export function MicrositeLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const integration = useMicrositeIntegration()
  const Link = integration.Link || "a"
  return <Link href={href ? integration.hrefOverrides?.[href] || href : href} {...props} />
}

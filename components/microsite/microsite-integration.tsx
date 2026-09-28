"use client"

import { createContext, useContext } from "react"
import type { AnchorHTMLAttributes, ComponentType, ReactNode, MouseEventHandler } from "react"

export type MicrositeCommerceAction = {
  kind: "food_pickup" | "table" | "appointment"
  label: string
  href: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

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
  commerceActions?: MicrositeCommerceAction[]
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

/** The same buttons occupy the original hero/header in Builder and public hosts. */
export function MicrositeCommerceActions({ compact = false }: { compact?: boolean }) {
  const actions = useMicrositeIntegration().commerceActions || []
  if (!actions.length) return null
  return <>{(compact ? actions.slice(0, 1) : actions).map((action, index) =>
    <MicrositeLink key={action.kind} href={action.href} onClick={action.onClick}
      data-commerce-kind={action.kind}
      className={`premium-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 ${index === 0 ? "bg-[var(--site-accent)] text-white shadow-[0_16px_30px_-18px_var(--site-accent)]" : "border border-zinc-200 bg-white text-zinc-900"}`}>
      {action.label}{index === 0 && <span aria-hidden="true">→</span>}
    </MicrositeLink>)}</>
}

export function MicrositeLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const integration = useMicrositeIntegration()
  const Link = integration.Link || "a"
  return <Link href={href ? integration.hrefOverrides?.[href] || href : href} {...props} />
}

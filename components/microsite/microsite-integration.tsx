"use client"

import { createContext, useContext } from "react"
import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react"

/** Host applications supply publication-aware sections without forking the design. */
export type MicrositeIntegration = {
  hideEmptySections?: boolean
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

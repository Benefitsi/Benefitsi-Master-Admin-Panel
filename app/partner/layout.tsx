import { AdminLanguageProvider } from "@/app/admin-language"
import { PartnerRouteLanguageControl } from "@/components/partner/partner-route-language-control"
import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: { absolute: 'Benefitsi Partner' },
  description: 'Dein Betrieb, Vorteile und Statistiken bei Benefitsi.',
}
export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLanguageProvider initialLanguage="de"><PartnerRouteLanguageControl />{children}</AdminLanguageProvider>
}

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
  return children
}

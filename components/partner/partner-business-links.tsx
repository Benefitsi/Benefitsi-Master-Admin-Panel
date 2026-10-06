import type { Entitlements } from '@/lib/partners/entitlements'
import { canManageProfile } from '@/lib/partners/entitlements'
import { partnerTypeSupportsMenu } from '@/lib/partners/management'
import {
  Clock3,
  Store,
  Images,
  Users,
  Utensils,
  Megaphone,
  AlarmClock,
  CreditCard,
} from 'lucide-react'
export function PartnerBusinessLinks({
  partnerId,
  rights,
  partnerType,
}: {
  partnerId: string
  rights: Entitlements
  partnerType: string | null
}) {
  const base = `/partner?section=business&partner=${encodeURIComponent(partnerId)}`
  if (!canManageProfile(rights)) return null
  const links = [
    {
      label: 'Öffnungszeiten',
      detail: 'Wochenplan & Ausnahmen',
      url: `${base}&tab=hours`,
      icon: Clock3,
    },
    {
      label: 'Happy Hour',
      detail: 'Zeitfenster & Vorteil bearbeiten',
      url: `/partner?section=deals&tab=deals&filter=happy_hour&partner=${encodeURIComponent(partnerId)}`,
      icon: AlarmClock,
    },
    {
      label: 'Profil & Kontakt',
      detail: 'Name, Beschreibung & Kontaktdaten',
      url: `${base}&tab=details#partner-contact`,
      icon: Store,
    },
    {
      label: 'Bilder',
      detail: 'Logo, Kartenbilder & Titelbilder',
      url: `${base}&tab=details#partner-media`,
      icon: Images,
    },
    ...(partnerTypeSupportsMenu(partnerType)
      ? [
          {
            label: 'Menü',
            detail: 'Kategorien, Einträge & Preise',
            url: `/partner?section=business&tab=menu&partner=${encodeURIComponent(partnerId)}`,
            icon: Utensils,
          },
        ]
      : []),
    ...(rights.features['team.manage'] === true
      ? [
          {
            label: 'Team & Zugänge',
            detail: 'Berechtigte Zugänge verwalten',
            url: `${base}&tab=access`,
            icon: Users,
          },
        ]
      : []),
    {
      label: 'Kundenbindung',
      detail: 'Gäste & Kampagnen · Entwürfe',
      url: `/partner/crm?partner=${encodeURIComponent(partnerId)}`,
      icon: Megaphone,
    },
    {
      label: 'Abo & Leistungen',
      detail: 'Tarif, Vertrag & Module',
      url: `/partner/billing?partner=${encodeURIComponent(partnerId)}`,
      icon: CreditCard,
    },
  ]
  return (
    <section aria-label="Betrieb verwalten" className="mb-6">
      <h1 className="mb-4 text-xl font-bold">Betrieb</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {links.map(({ label, detail, url, icon: Icon }) => (
          <a
            key={label}
            href={url}
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#118cff] focus-visible:outline-2 focus-visible:outline-[#118cff]"
          >
            <Icon className="mb-4 text-[#118cff]" size={24} />
            <strong className="block text-sm">{label}</strong>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {detail}
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}

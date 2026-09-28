'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { ComparisonPartner } from '@/lib/seo/seo-comparison-data'
import { createComparisonAction } from './actions'
import { inputClass } from './styles'

export function Submit({
  children,
  disabled = false,
}: {
  children: React.ReactNode
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending || disabled}
      className="rounded-md bg-[#118cff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b75d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Wird gespeichert …' : children}
    </button>
  )
}
export function CreateComparisonForm({
  partners,
  today,
  initialPartnerId,
}: {
  partners: ComparisonPartner[]
  today: string
  initialPartnerId?: string
}) {
  const [partnerId, setPartnerId] = useState(initialPartnerId ?? '')
  const [channel, setChannel] = useState('organic')
  const [url, setUrl] = useState(
    partners.find((p) => p.id === initialPartnerId)?.website ?? '',
  )
  return (
    <form action={createComparisonAction} className="mt-5 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Partner
          <select
            name="partner_id"
            required
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value)
              setUrl(
                channel === 'organic'
                  ? (partners.find((p) => p.id === e.target.value)?.website ??
                      '')
                  : '',
              )
            }}
            className={inputClass}
          >
            <option value="">Partner wählen …</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Messbereich
          <select
            name="channel"
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value)
              setUrl(
                e.target.value === 'organic'
                  ? (partners.find((p) => p.id === partnerId)?.website ?? '')
                  : '',
              )
            }}
            className={inputClass}
          >
            <option value="organic">Google-Suche · Webseite</option>
            <option value="maps">Google Maps · Unternehmensprofil</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        {channel === 'organic'
          ? 'Bestehende Webseite oder Benefitsi-Partnerseite'
          : 'Öffentliche Google-Maps-Profil-URL'}
        <input
          name="subject_url"
          type="url"
          required
          maxLength={2048}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500">
          Eine Website-Startseite misst die Domain. Eine konkrete Unterseite
          wird nur mit genau dieser Seite verglichen.
        </span>
      </label>
      <label className="block text-sm font-medium">
        Relevante Keywords
        <textarea
          name="keywords"
          required
          rows={5}
          placeholder={
            'Döner Annweiler\nPizza Annweiler\nKnobi Döner Annweiler'
          }
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500">
          Ein Suchbegriff pro Zeile, maximal 50. Leistungen mit Ortsbezug und
          den Unternehmensnamen erfassen. Keywords bleiben für diesen Vergleich
          fest.
        </span>
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Suchort
          <input
            name="location"
            required
            maxLength={200}
            placeholder="Annweiler am Trifels, DE"
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          Sprache
          <select name="locale" className={inputClass}>
            <option value="de-DE">Deutsch · Deutschland</option>
            <option value="en-DE">Englisch · Deutschland</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Gerät
          <select name="device" className={inputClass}>
            <option value="mobile">Mobil</option>
            <option value="desktop">Desktop</option>
          </select>
        </label>
      </div>
      {channel === 'maps' && (
        <div className="rounded-md border border-[#b8dcff] bg-[#f3f8ff] p-4">
          <p className="text-sm text-zinc-700">
            Lokale Rankings hängen vom Suchstandort ab. Dieser Vergleich gilt
            für einen festen Suchpunkt; weitere Punkte werden getrennt gemessen.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Suchpunkt · Breitengrad
              <input
                name="latitude"
                type="number"
                step="any"
                min={-90}
                max={90}
                required
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Suchpunkt · Längengrad
              <input
                name="longitude"
                type="number"
                step="any"
                min={-180}
                max={180}
                required
                className={inputClass}
              />
            </label>
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Partner seit · falls bestätigt
          <input
            name="partner_since"
            type="date"
            max={today}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          SEO-Paket angewendet seit · falls bereits begonnen
          <input
            name="package_started_on"
            type="date"
            max={today}
            className={inputClass}
          />
        </label>
      </div>
      <p className="text-sm leading-6 text-zinc-600">
        Unbekannte Startdaten bleiben leer. Die Einrichtung aktiviert weder ein
        Anbieterabo noch automatische Abrufe. Echte Messstände können
        anschließend importiert werden.
      </p>
      <Submit>Partnervergleich einrichten</Submit>
    </form>
  )
}

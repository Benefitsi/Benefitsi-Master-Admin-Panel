"use client"

import { ArrowUpRight, GlobeHemisphereWest } from "@phosphor-icons/react"
import { preferredSourceForDomain } from "@/lib/seo/preferred-source"

export function PreferredSourceCta({ sourceUrl }: { sourceUrl: string }) {
  const source = preferredSourceForDomain(sourceUrl)
  if (!source.ok) return null

  return (
    <aside className="mx-auto mt-5 max-w-3xl border border-zinc-200 bg-white/80 px-4 py-3 text-zinc-700 shadow-sm sm:rounded-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <GlobeHemisphereWest className="mt-0.5 size-5 shrink-0 text-teal-700" weight="duotone" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Diese Quelle in Google bevorzugen</p>
            <p className="mt-0.5 text-xs leading-5 text-zinc-500">Optionales Google-Signal für {source.domain}; kein Ranking-Versprechen.</p>
          </div>
        </div>
        <a href={source.deeplink} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
          In Google öffnen <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </div>
    </aside>
  )
}

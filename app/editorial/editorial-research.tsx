import type { EditorialIntakeResult } from "@/lib/editorial-review"

export function EditorialResearch({ result }: { result: EditorialIntakeResult }) {
  if (result.state === "missing") return null
  if (result.state === "unavailable") return <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">Die Recherche konnte nicht geladen werden. Du kannst den Artikel weiterhin bearbeiten; prüfe die Belege vor einer Veröffentlichung erneut.</div>
  const { data } = result
  return (
    <section id="editorial-research" aria-labelledby="editorial-research-title" className="space-y-5 rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6">
      <div>
        <h2 id="editorial-research-title" className="text-xl font-black tracking-[-0.025em]">Recherche zur Prüfung</h2>
        <p className="mt-2 text-sm leading-6 text-[#617080]">Die Suchnachfrage wurde nicht gemessen. Die Suchbegriffe sind redaktionelle Vorschläge; Quellen und Bildrechte bitte vor der Veröffentlichung prüfen.</p>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-black">Hauptsuchbegriff</dt><dd className="mt-1 text-[#617080]">{data.primaryKeyword ? <span data-admin-i18n-ignore="true">{data.primaryKeyword}</span> : "Nicht dokumentiert"}</dd></div>
        <div><dt className="font-black">Weitere Suchbegriffe</dt><dd className="mt-1 text-[#617080]">{data.secondaryKeywords.length ? <span data-admin-i18n-ignore="true">{data.secondaryKeywords.join(" · ")}</span> : "Keine weiteren Suchbegriffe"}</dd></div>
        <div><dt className="font-black">Suchabsicht</dt><dd className="mt-1 text-[#617080]">{data.intent}</dd></div>
        <div><dt className="font-black">Bildrechte</dt><dd className="mt-1 text-[#617080]">{data.imageStatus}{data.imageEvidence ? <p data-admin-i18n-ignore="true" className="mt-1">{data.imageEvidence}</p> : null}</dd></div>
      </dl>
      <div>
        <h3 className="text-sm font-black">Quellen und Belege</h3>
        {data.sources.length ? <ul className="mt-2 space-y-3 text-sm">{data.sources.map((source, index) => <li key={`${source.url}-${index}`} className="border-l-2 border-[#118cff]/25 pl-3">
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-[#0b75d9] underline underline-offset-2">{source.url}</a>
          <p className="mt-1 text-xs font-semibold text-[#617080]">{source.checkedAt ? `Laut Recherche geprüft am ${source.checkedAt}` : "Prüfdatum fehlt"}</p>
          <p className="mt-1 leading-6">{source.evidence ? <span data-admin-i18n-ignore="true">{source.evidence}</span> : "Kein Belegtext dokumentiert."}</p>
        </li>)}</ul> : <p className="mt-2 text-sm text-[#617080]">Keine verwendbaren Quellenangaben vorhanden.</p>}
      </div>
      {data.proposal ? <details className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <summary className="cursor-pointer text-sm font-black text-amber-950">Neuen Textvorschlag prüfen</summary>
        <p className="mt-3 text-sm font-semibold text-amber-950">Die Automatik übernimmt Überarbeitungsvorschläge nicht selbst. Vergleiche den Vorschlag mit dem aktuellen Artikel.</p>
        <div className="mt-4 space-y-3 text-sm leading-6">
          <h3 className="text-lg font-black">{data.proposal.title ? <span data-admin-i18n-ignore="true">{data.proposal.title}</span> : "Vorschlag ohne Titel"}</h3>
          {data.proposal.excerpt ? <p><span data-admin-i18n-ignore="true">{data.proposal.excerpt}</span></p> : null}
          {data.proposal.sections.map((section, index) => <div data-admin-i18n-ignore="true" key={index}><h4 className="font-black">{section.heading}</h4>{section.paragraphs.map((paragraph, index) => <p className="mt-2" key={index}>{paragraph}</p>)}</div>)}
          {data.proposal.sources.length ? <ul className="space-y-1">{data.proposal.sources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#0b75d9] underline"><span data-admin-i18n-ignore="true">{source.label}</span></a></li>)}</ul> : null}
        </div>
      </details> : null}
    </section>
  )
}

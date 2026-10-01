export function PartnerStatisticsToolbar({
  partnerId,
  preset,
  advanced,
  exportable,
  from,
  to,
}: {
  partnerId: string;
  preset: string;
  advanced: boolean;
  exportable: boolean;
  from?: string;
  to?: string;
}) {
  const exportQuery = new URLSearchParams({
    partner: partnerId,
    period: preset,
    ...(from ? { from: from } : {}),
    ...(to ? { to: to } : {}),
  });
  return (
    <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5">
      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="partner" value={partnerId} />
        <label className="min-w-0 max-w-full text-sm font-medium">
          Zeitraum
          <select
            name="period"
            defaultValue={preset}
            className="mt-1 block w-full min-w-0 max-w-full rounded-lg border border-slate-300 p-2.5"
          >
            <option value="today">Heute</option>
            <option value="last7">Letzte 7 Tage</option>
            <option value="last30">Letzte 30 Tage</option>
            {advanced && (
              <option value="custom">Freie Auswahl (bis 365 Tage)</option>
            )}
            {exportable && (
              <option value="month">
                Monatsbericht · letzter abgeschlossener Monat
              </option>
            )}
          </select>
        </label>
        {advanced && (
          <>
            <label className="min-w-0 max-w-full text-sm">
              Von (Berlin)
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="mt-1 block w-full min-w-0 max-w-full rounded-lg border border-slate-300 p-2.5"
              />
            </label>
            <label className="min-w-0 max-w-full text-sm">
              Bis einschließlich (Berlin)
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="mt-1 block w-full min-w-0 max-w-full rounded-lg border border-slate-300 p-2.5"
              />
            </label>
          </>
        )}
        <button className="rounded-lg bg-[#087cd9] px-4 py-2.5 text-sm font-bold text-white">
          Anwenden
        </button>
      </form>
      {exportable && (
        <a
          href={`/partner/statistics/export?${exportQuery}`}
          className="mt-4 inline-block text-sm font-semibold text-sky-700 underline"
        >
          Aggregierte Daten als CSV herunterladen
        </a>
      )}
      {!advanced && (
        <p className="mt-3 text-sm text-slate-500">
          Free enthält Tagesverlauf und Heute / 7 / 30 Tage. Freie Auswahl,
          Vergleiche, Monatsbericht und Export erfordern Pro.
        </p>
      )}
    </div>
  );
}

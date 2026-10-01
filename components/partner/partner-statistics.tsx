import {
  VisitChart,
  ReturningRing,
  DistributionBar,
} from "@/components/partner/partner-charts";
import { Users, UserRound, History, Ticket } from "lucide-react";
import { metricNumber } from "@/lib/partners/chart-data";
import {
  formatBerlinRange,
  metricLabels,
  statusLabels,
  type Dashboard,
  type Metric,
} from "@/lib/partners/analytics";
function valueLabel(key: string, metric: Metric) {
  if (
    !["ok", "empty"].includes(metric.status) ||
    metricNumber(metric) === null ||
    (["return_30d", "returning_guest_share"].includes(key) && metric.value! > 1)
  )
    return "—";
  return new Intl.NumberFormat("de-DE", {
    ...(key === "return_30d" || key === "returning_guest_share"
      ? { style: "percent" as const, maximumFractionDigits: 1 }
      : { maximumFractionDigits: 0 }),
  }).format(metric.value!);
}
const feedbackCategoryLabels: Record<string, string> = {
  clear: "Verständlich",
  mostly_clear: "Überwiegend verständlich",
  unclear: "Unverständlich",
  none: "Keine Probleme",
  deal: "Problem mit dem Angebot",
  stamp: "Problem mit dem Stempel",
  scan: "Problem beim Scannen",
  other: "Sonstiges",
};

export function PartnerStatistics({
  data,
  compact = false,
}: {
  data: Dashboard;
  compact?: boolean;
}) {
  const keys = ["visits", "guests", "returning_guest_share", "redemptions"];
  const icons = [Users, UserRound, History, Ticket];
  const deferred = Object.keys(metricLabels).filter((key) =>
    ["locked", "unavailable"].includes(data.metrics[key]?.status),
  );
  const feedback = data.metrics.feedback;
  const scope = feedback?.scope as { from?: string; to?: string } | undefined;
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        {formatBerlinRange(data.period.from, data.period.to)} · Europe/Berlin ·
        Stand{" "}
        {new Intl.DateTimeFormat("de-DE", {
          timeZone: "Europe/Berlin",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(data.as_of))}
      </p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {keys.map((key, index) => {
          const Icon = icons[index];
          const metric = data.metrics[key];
          if (!metric) return null;
          const comparison = data.comparison[key];
          return (
            <article
              className={`min-w-0 rounded-3xl border p-4 [overflow-wrap:anywhere] sm:p-6 ${index === 0 ? "border-[#17394e] bg-[#061829] text-white shadow-sm" : "border-slate-200 bg-white"}`}
              key={key}
            >
              <Icon
                size={28}
                className={
                  index === 0 ? "mb-4 text-[#17d4d7]" : "mb-4 text-[#118cff]"
                }
              />
              <h3 className="text-sm font-medium sm:text-base">
                {metricLabels[key]}
              </h3>
              <p className="mt-2 text-3xl font-bold tracking-tight xl:text-4xl">
                {valueLabel(key, metric)}
              </p>
              <p
                className={`mt-2 text-xs leading-5 ${index === 0 ? "text-slate-300" : "text-slate-500"}`}
              >
                {statusLabels[metric.status] ?? "Status unbekannt"}
                {key === "open_cards" ? " · Aktueller Bestand" : ""}
              </p>
              {comparison && (
                <p
                  className={`mt-2 text-xs ${index === 0 ? "text-slate-300" : "text-slate-600"}`}
                >
                  {metricNumber(metric) !== null &&
                  typeof comparison.relative_change === "number" &&
                  Number.isFinite(comparison.relative_change)
                    ? `${new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" }).format(comparison.relative_change)} zum Vergleichszeitraum`
                    : "Kein relativer Vergleich möglich"}
                  {metricNumber(metric) !== null &&
                  typeof comparison.previous === "number" &&
                  Number.isFinite(comparison.previous)
                    ? ` · zuvor ${valueLabel(key, { status: "ok", value: comparison.previous })}`
                    : ""}
                </p>
              )}
              {key === "return_30d" && (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Nur vollständig gereifte Erstbesuchswochen.
                  {metric.coverage_from && metric.coverage_to
                    ? ` Abdeckung: ${formatBerlinRange(metric.coverage_from, metric.coverage_to)}.`
                    : ""}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {!compact && (
        <p className="text-sm text-slate-500">
          Erstmalige und wiederkehrende Gäste können sich überschneiden. Besuche
          zählen bestätigte Besuche; Einlösungen zählen bestätigte, nicht
          stornierte Vorteile. Es werden keine Umsätze abgeleitet.
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="text-lg font-bold">Besuchsverlauf</h3>
          <p className="mt-1 text-sm text-slate-500">
            Bestätigte Besuche · Randzeiträume können unvollständig sein.
          </p>
          {data.series.daily && <VisitChart series={data.series.daily} />}
          {!compact && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-sky-800">
                Wochen & Monate
              </summary>
              {["weekly", "monthly"].map(
                (key) =>
                  data.series[key] && (
                    <div key={key} className="mt-5">
                      <h4 className="font-semibold">
                        {key === "weekly"
                          ? "Besuche je Woche"
                          : "Besuche je Monat"}
                      </h4>
                      <VisitChart series={data.series[key]} />
                    </div>
                  ),
              )}
            </details>
          )}
        </section>
        <ReturningRing metric={data.metrics.returning_guest_share} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {!compact && feedback && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">
              Gästefeedback · letzte abgeschlossene Kalenderwoche
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Unabhängig vom ausgewählten Statistikzeitraum.
              {scope?.from && scope.to
                ? ` ${formatBerlinRange(scope.from, scope.to)}.`
                : ""}
            </p>
            <p className="mt-4 text-4xl font-bold">
              {feedback.status === "ok" &&
              typeof feedback.average_rating === "number" &&
              Number.isFinite(feedback.average_rating)
                ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(feedback.average_rating)} / 5`
                : "—"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {statusLabels[feedback.status]}
              {["ok", "empty"].includes(feedback.status) &&
              typeof feedback.response_count === "number"
                ? ` · ${feedback.response_count} Antworten`
                : ""}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Kategorien:{" "}
              {statusLabels[feedback.categories_status ?? "unavailable"] ??
                "Nicht verfügbar"}
            </p>
            {feedback.status === "ok" &&
              feedback.categories_status === "ok" && (
                <div className="mt-2 text-sm">
                  {Object.entries({
                    ...feedback.clarity,
                    ...feedback.issues,
                  }).map(([key, count]) => (
                    <DistributionBar
                      key={key}
                      label={
                        Object.hasOwn(feedbackCategoryLabels, key)
                          ? feedbackCategoryLabels[key]
                          : "Weitere Kategorie"
                      }
                      value={count}
                      max={feedback.response_count ?? 0}
                    />
                  ))}
                </div>
              )}
          </section>
        )}
        {!compact && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">Besuchszeiten & Verteilung</h3>
            <p className="mt-2 text-sm text-slate-500">
              Nur vollständig abgeschlossene Kalenderwochen im gewählten
              Zeitraum. Kleine Gruppen werden ausgeblendet.{" "}
              {statusLabels[data.breakdowns.status]}
            </p>
            {data.breakdowns.status === "ok" &&
              data.breakdowns.weeks?.map((week) => (
                <div
                  key={week.from}
                  className="mt-5 border-t border-slate-100 pt-4"
                >
                  <h4 className="text-sm font-semibold">
                    {formatBerlinRange(week.from, week.to)}
                  </h4>
                  {(["peak_times", "visit_frequency", "offers"] as const).map(
                    (key) => {
                      const dimension = week[key];
                      return (
                        <div className="mt-3" key={key}>
                          <p className="text-sm font-medium">
                            {key === "peak_times"
                              ? "Besuchszeiten · Besuche"
                              : key === "visit_frequency"
                                ? "Besuchshäufigkeit · Gäste"
                                : "Vorteilseinlösungen"}
                            {key === "peak_times" && week.peak_times.granularity
                              ? ` · ${({ weekday_hour: "Wochentag & Stunde", weekday: "Wochentag", daypart: "Tagesabschnitt" } as Record<string, string>)[week.peak_times.granularity]}`
                              : ""}
                          </p>
                          <p className="text-xs text-slate-500">
                            {statusLabels[dimension.status]}
                          </p>
                          {["ok", "empty"].includes(dimension.status) &&
                          dimension.buckets?.length ? (
                            <ul className="mt-2 space-y-1 text-sm">
                              {dimension.buckets.map((bucket, i) => (
                                <li key={i}>
                                  <DistributionBar
                                    label={Object.entries(bucket)
                                      .filter(
                                        ([label]) =>
                                          ![
                                            "visits",
                                            "guests",
                                            "redemptions",
                                            "sample_size",
                                          ].includes(label),
                                      )
                                      .map(([label, value]) =>
                                        label === "deal_id"
                                          ? value
                                            ? "Vorteil " + (i + 1)
                                            : "Nicht zugeordnet"
                                          : label === "weekday"
                                            ? ([
                                                "",
                                                "Mo",
                                                "Di",
                                                "Mi",
                                                "Do",
                                                "Fr",
                                                "Sa",
                                                "So",
                                              ][Number(value)] ?? "Tag")
                                            : label === "hour"
                                              ? value + " Uhr"
                                              : label === "daypart"
                                                ? ((
                                                    {
                                                      night_00_06:
                                                        "Nacht 00–06 Uhr",
                                                      morning_06_12:
                                                        "Vormittag 06–12 Uhr",
                                                      afternoon_12_18:
                                                        "Nachmittag 12–18 Uhr",
                                                      evening_18_24:
                                                        "Abend 18–24 Uhr",
                                                    } as Record<string, string>
                                                  )[value] ?? "Tagesabschnitt")
                                                : String(value),
                                      )
                                      .join(" · ")}
                                    value={
                                      bucket.visits ??
                                      bucket.guests ??
                                      bucket.redemptions
                                    }
                                    max={Math.max(
                                      1,
                                      ...dimension.buckets!.map(
                                        (b) =>
                                          Number(
                                            b.visits ??
                                              b.guests ??
                                              b.redemptions,
                                          ) || 0,
                                      ),
                                    )}
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    },
                  )}
                </div>
              ))}
          </section>
        )}
      </div>
      {!compact && (
        <details className="rounded-3xl border border-slate-200 bg-white p-6">
          <summary className="cursor-pointer font-bold">
            Weitere Kennzahlen & Definitionen
          </summary>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.keys(metricLabels)
              .filter((key) => !keys.includes(key))
              .map(
                (key) =>
                  data.metrics[key] && (
                    <div key={key}>
                      <dt className="text-sm text-slate-500">
                        {metricLabels[key]}
                      </dt>
                      <dd className="mt-1 text-xl font-bold">
                        {valueLabel(key, data.metrics[key])}
                      </dd>
                      <p className="text-xs text-slate-500">
                        {statusLabels[data.metrics[key].status]}
                        {key === "open_cards" ? " · Aktueller Bestand" : ""}
                      </p>
                      {key === "return_30d" && (
                        <p className="text-xs text-slate-500">
                          Nur vollständig gereifte Erstbesuchswochen.{" "}
                          {data.metrics[key].coverage_from &&
                          data.metrics[key].coverage_to
                            ? formatBerlinRange(
                                data.metrics[key].coverage_from!,
                                data.metrics[key].coverage_to!,
                              )
                            : ""}
                        </p>
                      )}
                    </div>
                  ),
              )}
          </dl>
        </details>
      )}
      {!compact && deferred.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="font-bold">Weitere Auswertungen</h3>
          {data.metrics.return_30d?.status === "locked" && (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Kommen neue Gäste innerhalb von 30 Tagen wieder? Pro zeigt dir
              auswertbare Rückkehrquoten, Vergleiche und häufige Besuchszeiten.
              So erkennst du, wann Gäste wiederkommen und welche Zeiten sich für
              Vorteile eignen.
            </p>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {deferred.map((key) => (
              <li key={key}>
                <span className="font-medium">{metricLabels[key]}</span> ·{" "}
                {statusLabels[data.metrics[key].status]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Für Prämieneinlösungen, Kartenabschlussquote und Angebotskonversion
            fehlen noch belastbare Messgrundlagen. Sie werden auch in Pro nicht
            als null Ereignisse ausgegeben.
          </p>
        </section>
      )}
    </div>
  );
}

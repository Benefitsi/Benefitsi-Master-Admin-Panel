"use client";
import { useAdminLocale } from "@/app/admin-language";
import { useId } from "react";
import {
  formatBerlin,
  statusLabels,
  type Dashboard,
  type Metric,
} from "@/lib/partners/analytics";
import { chartBuckets, metricNumber } from "@/lib/partners/chart-data";
export function VisitChart({
  series,
}: {
  series: Dashboard["series"][string];
}) {
  const locale = useAdminLocale();
  const id = useId(),
    buckets = chartBuckets(series);
  if (!buckets.length)
    return (
      <p className="py-12 text-sm text-slate-500">
        {!["ok", "empty"].includes(series.status)
          ? (statusLabels[series.status] ?? "Nicht verfügbar")
          : "Keine darstellbaren Zeitwerte verfügbar."}
      </p>
    );
  const max = Math.max(1, ...buckets.map((b) => b.visits)),
    x = (i: number) =>
      buckets.length === 1 ? 360 : 48 + (i * 624) / (buckets.length - 1),
    y = (v: number) => 210 - (v / max) * 174;
  const line = buckets
    .map((b, i) => `${i ? "L" : "M"}${x(i)},${y(b.visits)}`)
    .join(" ");
  return (
    <>
      <div className="mt-6 flex gap-3" data-chart-plot>
        <div
          className="relative w-9 shrink-0 text-xs text-slate-500"
          aria-label="Achse: Besuche"
        >
          {[1, 0.5, 0].map((n) => (
            <span data-admin-i18n-ignore="true"
              key={n}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - n) * 100}%` }}
            >
              {Math.round(max * n).toLocaleString(locale)}
            </span>
          ))}
        </div>
        <svg
          role="img"
          aria-label={`Besuchsverlauf: ${buckets.length.toLocaleString(locale)} Zeitwerte; exakte Werte in der Tabelle`}
          viewBox="48 36 624 174"
          preserveAspectRatio="none"
          className="h-44 min-w-0 flex-1 overflow-visible sm:h-56"
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#118cff" stopOpacity=".22" />
              <stop offset="1" stopColor="#118cff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((n) => (
            <g key={n}>
              <line
                x1="48"
                x2="672"
                y1={y(max * n)}
                y2={y(max * n)}
                stroke="#e2e8f0"
              />
            </g>
          ))}
          <path
            d={`${line} L${x(buckets.length - 1)},210 L${x(0)},210 Z`}
            fill={`url(#${id})`}
          />
          <path
            d={line}
            fill="none"
            stroke="#118cff"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {buckets.length <= 40 &&
            buckets.map((b, i) => (
              <circle
                key={b.start}
                cx={x(i)}
                cy={y(b.visits)}
                r="4"
                fill="#118cff"
              >
                <title>{`${formatBerlin(b.start, locale)}: ${b.visits.toLocaleString(locale)} Besuche`}</title>
              </circle>
            ))}
        </svg>
      </div>
      <div
        className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 pl-12 text-xs text-slate-500"
        aria-label="Zeitraum der Besuchswerte"
      >
        <span data-admin-i18n-ignore="true">{formatBerlin(buckets[0].start, locale)}</span>
        {buckets.length > 1 && (
          <span data-admin-i18n-ignore="true">{formatBerlin(buckets[buckets.length - 1].start, locale)}</span>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-sky-800">
          Exakte Werte anzeigen
        </summary>
        <div
          tabIndex={0}
          role="region"
          aria-label="Besuchsverlauf scrollen"
          className="mt-3 max-h-64 overflow-auto"
        >
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Zeitraum beginnt</th>
                <th className="text-right">Besuche</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start} className="border-t border-slate-100">
                  <td data-admin-i18n-ignore="true" className="py-2">{formatBerlin(b.start, locale)}</td>
                  <td data-admin-i18n-ignore="true" className="text-right">{b.visits.toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function ReturningRing({ metric }: { metric?: Metric }) {
  const locale = useAdminLocale();
  const raw = metricNumber(metric),
    value = raw !== null && raw <= 1 ? raw : null;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-bold">Wiederkehr</h3>
      <p className="mt-1 text-sm text-slate-500">
        Wiederkehranteil im gewählten Zeitraum
      </p>
      {value === null ? (
        <p className="py-10 text-sm text-slate-500">
          {statusLabels[metric?.status ?? "unavailable"] ?? "Nicht verfügbar"}
        </p>
      ) : (
        <div className="relative mx-auto mt-5 w-48">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle
              cx="100"
              cy="100"
              r="82"
              stroke="#edf1f7"
              strokeWidth="20"
              fill="none"
            />
            <circle
              cx="100"
              cy="100"
              r="82"
              stroke="#17d4d7"
              strokeWidth="20"
              fill="none"
              pathLength="100"
              strokeDasharray={`${value * 100} 100`}
              transform="rotate(-90 100 100)"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <strong data-admin-i18n-ignore="true" className="text-3xl">
              {new Intl.NumberFormat(locale, {
                style: "percent",
                maximumFractionDigits: 1,
              }).format(value)}
            </strong>
            <span className="mt-1 text-xs text-slate-500">
              Wiederkehranteil
            </span>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Anteil der Gäste mit wiederholten Besuchen im gewählten Zeitraum.
        Erstmalige und wiederkehrende Gäste können sich überschneiden.
      </p>
    </section>
  );
}
export function DistributionBar({
  label,
  value,
  max,
}: {
  label: string;
  value: unknown;
  max: number;
}) {
  const locale = useAdminLocale();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  return (
    <div className="mt-3">
      <dl className="mb-1 flex justify-between gap-3 text-sm">
        <dt>{label}</dt>
        <dd data-admin-i18n-ignore="true" className="font-bold">{value.toLocaleString(locale)}</dd>
      </dl>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#118cff]"
          style={{
            width: `${Number.isFinite(max) && max > 0 ? Math.min(100, (value / max) * 100) : 0}%`,
          }}
        />
      </div>
    </div>
  );
}

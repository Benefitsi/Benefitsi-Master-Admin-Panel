import type { Dashboard, Metric } from "./analytics";
export function metricNumber(metric?: Metric): number | null {
  return metric &&
    ["ok", "empty"].includes(metric.status) &&
    typeof metric.value === "number" &&
    Number.isFinite(metric.value) &&
    metric.value >= 0
    ? metric.value
    : null;
}
// Reject malformed series as a whole: dropping points would imply continuity across missing data.
export function chartBuckets(series?: Dashboard["series"][string]) {
  if (
    !series ||
    !["ok", "empty"].includes(series.status) ||
    !Array.isArray(series.buckets)
  )
    return [];
  return series.buckets.every(
    (b) =>
      b &&
      typeof b === "object" &&
      (!("status" in b) || ["ok", "empty"].includes(String(b.status))) &&
      Number.isFinite(Date.parse(b.start)) &&
      typeof b.visits === "number" &&
      Number.isFinite(b.visits) &&
      b.visits >= 0,
  )
    ? series.buckets
    : [];
}

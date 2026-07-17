import type { AnalyticsPermissions } from "./contracts"

export function parseAnalyticsPermissions(input: unknown): AnalyticsPermissions {
  const record = unwrapRecord(input)

  return {
    businessAnalyticsRead: permissionValue(
      record.business_analytics_read ??
        record.businessAnalyticsRead ??
        record["business_analytics:read"],
    ),
    financeRead: permissionValue(
      record.finance_read ?? record.financeRead ?? record["finance:read"],
    ),
  }
}

function unwrapRecord(input: unknown): Record<string, unknown> {
  if (Array.isArray(input)) {
    return unwrapRecord(input[0])
  }

  if (!isRecord(input)) return {}

  if (isRecord(input.permissions)) {
    return input.permissions
  }

  return input
}

function permissionValue(value: unknown) {
  return value === true || value === 1 || value === "true"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

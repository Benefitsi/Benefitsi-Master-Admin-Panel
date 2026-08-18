import { freshnessState } from "./freshness"

export type CityAgentQaIssue = {
  code: string
  severity: "info" | "warning" | "blocking"
  message: string
  sourceUrl?: string
}

export function sourceQaIssues(input: {
  url: string
  httpStatus?: number
  contentType?: string
  truncated?: boolean
  lastVerifiedAt?: string | null
}) {
  const issues: CityAgentQaIssue[] = []
  if (!/^https:\/\//i.test(input.url)) issues.push({ code: "SOURCE_NOT_HTTPS", severity: "blocking", message: "Quelle verwendet kein HTTPS.", sourceUrl: input.url })
  if (typeof input.httpStatus === "number" && (input.httpStatus < 200 || input.httpStatus >= 400)) issues.push({ code: "SOURCE_HTTP_ERROR", severity: "warning", message: `Quelle antwortet mit HTTP ${input.httpStatus}.`, sourceUrl: input.url })
  if (input.contentType && !/html|xhtml|plain|json|pdf/i.test(input.contentType)) issues.push({ code: "SOURCE_CONTENT_TYPE", severity: "warning", message: `Nicht erwarteter Content-Type: ${input.contentType}.`, sourceUrl: input.url })
  if (input.truncated) issues.push({ code: "SOURCE_TRUNCATED", severity: "warning", message: "Quellenantwort wurde aus Sicherheitsgründen gekürzt.", sourceUrl: input.url })
  if (freshnessState({ lastVerifiedAt: input.lastVerifiedAt, ttlDays: 30 }) === "STALE") issues.push({ code: "SOURCE_STALE", severity: "warning", message: "Quelle wurde zu lange nicht erfolgreich geprüft.", sourceUrl: input.url })
  return issues
}

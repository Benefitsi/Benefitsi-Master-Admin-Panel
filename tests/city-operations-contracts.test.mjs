import assert from "node:assert/strict"
import test from "node:test"

import {
  canPublishReview,
  filterCityReviewRecords,
  normalizeIssues,
} from "../lib/city-operations/contracts.ts"

function publishableEvent(overrides = {}) {
  return {
    contentType: "events",
    reviewId: "8343f46b-b9fe-4f69-8afd-7f4b84967d35",
    stage: "ready_for_human",
    verdict: "pass",
    issues: [],
    sourceUrl: "https://example.org/veranstaltung",
    sourceVerified: true,
    sourceStatus: "verified",
    sourceCheckedAt: "2026-07-28T08:00:00.000Z",
    endTimeVerified: true,
    endsAt: "2026-08-10T20:00:00.000Z",
    expiresAt: "2026-08-10T20:00:00.000Z",
    ...overrides,
  }
}

test("publishes only a fresh, sourced and fully verified event review", () => {
  const now = new Date("2026-08-01T08:00:00.000Z")
  assert.equal(canPublishReview(publishableEvent(), now), true)
  assert.equal(
    canPublishReview(publishableEvent({ endTimeVerified: false }), now),
    false,
  )
  assert.equal(
    canPublishReview(
      publishableEvent({
        issues: [
          {
            code: "unverified_end_time",
            field: "end_date",
            severity: "blocking",
            message: "Endzeit ist nicht belegt.",
          },
        ],
      }),
      now,
    ),
    false,
  )
  assert.equal(
    canPublishReview(publishableEvent({ sourceUrl: "http://example.org" }), now),
    false,
  )
  assert.equal(
    canPublishReview(
      publishableEvent({ sourceCheckedAt: "2026-06-01T08:00:00.000Z" }),
      now,
    ),
    false,
  )
  assert.equal(
    canPublishReview(
      publishableEvent({ sourceCheckedAt: "2026-08-02T08:00:00.000Z" }),
      now,
    ),
    false,
  )
  assert.equal(
    canPublishReview(
      publishableEvent({ expiresAt: "2026-08-10T19:59:00.000Z" }),
      now,
    ),
    false,
  )
  assert.equal(
    canPublishReview(publishableEvent({ sourceStatus: "timeout" }), now),
    false,
  )
})

test("allows supported evergreen content without weakening event or expiry gates", () => {
  const now = new Date("2026-08-01T08:00:00.000Z")
  assert.equal(
    canPublishReview(
      publishableEvent({
        contentType: "places",
        endTimeVerified: false,
        endsAt: null,
        expiresAt: null,
      }),
      now,
    ),
    true,
  )
  assert.equal(
    canPublishReview(
      publishableEvent({
        contentType: "places",
        endTimeVerified: false,
        endsAt: null,
        expiresAt: "2026-07-31T23:59:00.000Z",
      }),
      now,
    ),
    false,
  )
  assert.equal(
    canPublishReview(
      publishableEvent({ contentType: "unknown" }),
      now,
    ),
    false,
  )
})

test("normalizes untrusted agent issues into bounded review data", () => {
  assert.deepEqual(
    normalizeIssues([
      null,
      { message: "  Ende fehlt  ", severity: "blocking", field: "end_date" },
      { message: "", severity: "warning" },
      { message: "Info", severity: "unknown" },
    ]),
    [
      {
        code: "review_issue",
        field: "end_date",
        severity: "blocking",
        message: "Ende fehlt",
        suggestion: undefined,
        actual: undefined,
        expected: undefined,
      },
      {
        code: "review_issue",
        field: "content",
        severity: "info",
        message: "Info",
        suggestion: undefined,
        actual: undefined,
        expected: undefined,
      },
    ],
  )
})

test("filters the global queue by region membership, city, type, stage and text", () => {
  const base = {
    id: "1",
    reviewId: null,
    cityId: "annweiler-id",
    cityName: "Annweiler am Trifels",
    citySlug: "annweiler",
    contentType: "events",
    title: "Burgentagung",
    description: "Veranstaltung auf dem Trifels",
    category: null,
    contentStatus: "draft",
    stage: "agent_draft",
    verdict: "unreviewed",
    summary: null,
    issues: [],
    sourceName: null,
    sourceUrl: null,
    sourceStatus: "missing",
    sourceVerified: false,
    sourceCheckedAt: null,
    endTimeVerified: false,
    agentProfile: null,
    reviewerProfile: null,
    startsAt: null,
    endsAt: null,
    expiresAt: null,
    lastVerifiedAt: null,
    updatedAt: null,
  }
  const records = [
    base,
    {
      ...base,
      id: "2",
      cityId: "landau-id",
      cityName: "Landau",
      citySlug: "landau",
      title: "Wochenmarkt",
      stage: "ready_for_human",
    },
  ]

  assert.deepEqual(
    filterCityReviewRecords(records, {
      regionCityIds: new Set(["annweiler-id"]),
      query: "trifels",
      contentType: "events",
      stage: "agent_draft",
    }).map((record) => record.id),
    ["1"],
  )
  assert.deepEqual(
    filterCityReviewRecords(records, { city: "landau" }).map(
      (record) => record.id,
    ),
    ["2"],
  )
})

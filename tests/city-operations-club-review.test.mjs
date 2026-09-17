import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import * as contracts from "../lib/city-operations/contracts.ts"
import {
  IssueList,
  ReviewQueueRow,
} from "../components/city-operations/review-ui.tsx"

function publishedClub(issues) {
  return {
    id: "4f0cba1d-a08c-4d12-9204-c5fe36ae20ac",
    reviewId: "97e71a53-164c-4b19-88bd-f12d2624d713",
    cityId: "b9e684e4-54b3-41ff-8f97-4426423893c2",
    cityName: "Annweiler am Trifels",
    citySlug: "annweiler",
    contentType: "clubs",
    title: "TSV Annweiler",
    description: "Sportverein in Annweiler",
    category: "Sport",
    contentStatus: "active",
    stage: "published",
    verdict: "pass",
    summary: null,
    issues,
    sourceName: "Vereinswebsite",
    sourceUrl: "https://example.org/verein",
    sourceStatus: "verified",
    sourceVerified: true,
    sourceCheckedAt: "2026-09-17T08:00:00.000Z",
    endTimeVerified: false,
    agentProfile: "ben",
    reviewerProfile: "Redaktion",
    startsAt: null,
    endsAt: null,
    expiresAt: null,
    lastVerifiedAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-17T08:00:00.000Z",
  }
}

const sourceChange = {
  kind: "club_source_change",
  status: "needs_review",
  source_url: "https://example.org/verein/neuigkeiten",
  checked_at: "2026-09-17T08:00:00.000Z",
  message: "Geänderte Vereinsquelle redaktionell vergleichen.",
}

const profileProposal = {
  kind: "club_profile_proposal",
  status: "needs_review",
  proposed_values: { description: "Neuer Beschreibungsvorschlag" },
  message: "Bestehenden Verein mit dem Profilvorschlag abgleichen.",
}

test("keeps an appended open club source issue within the worker's bounded issue contract", () => {
  const olderIssues = Array.from({ length: 31 }, (_, index) => ({
    code: `older-${index}`,
    message: `Älterer Hinweis ${index}`,
  }))
  const issues = contracts.normalizeIssues([...olderIssues, sourceChange])

  assert.equal(issues.length, 32)
  assert.deepEqual(issues.at(-1), {
    code: "club_source_change",
    field: "source",
    severity: "warning",
    message: "Geänderte Vereinsquelle redaktionell vergleichen.",
    suggestion: undefined,
    actual: undefined,
    expected: undefined,
    kind: "club_source_change",
    status: "needs_review",
    sourceUrl: "https://example.org/verein/neuigkeiten",
    checkedAt: "2026-09-17T08:00:00.000Z",
  })
})

test("treats a published review with an open club issue as queue work", () => {
  assert.equal(typeof contracts.isOpenCityReview, "function")

  const open = publishedClub(contracts.normalizeIssues([sourceChange]))
  const proposed = publishedClub(contracts.normalizeIssues([profileProposal]))
  const resolved = publishedClub(
    contracts.normalizeIssues([{ ...sourceChange, status: "resolved" }]),
  )

  assert.equal(contracts.isOpenCityReview(open), true)
  assert.equal(contracts.isOpenCityReview(proposed), true)
  assert.equal(contracts.isOpenCityReview(resolved), false)
  assert.equal(
    contracts.isOpenCityReview({ ...open, contentType: "events" }),
    false,
  )
  assert.deepEqual(
    contracts.filterCityReviewRecords([open, resolved], { stage: "open" }),
    [open],
  )
})

test("distinguishes profile proposals from source changes in the queue", () => {
  const row = renderToStaticMarkup(
    createElement(ReviewQueueRow, {
      record: publishedClub(contracts.normalizeIssues([profileProposal])),
    }),
  )

  assert.match(row, /Vereinsprofil vorgeschlagen/)
  assert.match(row, /Prüfung offen/)
})

test("shows the club change in the queue and links to the existing review detail", () => {
  const issues = contracts.normalizeIssues([sourceChange])
  const row = renderToStaticMarkup(
    createElement(ReviewQueueRow, { record: publishedClub(issues) }),
  )
  const list = renderToStaticMarkup(createElement(IssueList, { issues }))

  assert.match(row, /Veröffentlicht/)
  assert.match(row, /Vereinsquelle geändert/)
  assert.match(row, /Prüfung offen/)
  assert.match(
    row,
    /href="\/city-operations\/clubs\/4f0cba1d-a08c-4d12-9204-c5fe36ae20ac"/,
  )
  assert.match(list, /Quellenänderung/)
  assert.match(list, /href="https:\/\/example\.org\/verein\/neuigkeiten"/)
})

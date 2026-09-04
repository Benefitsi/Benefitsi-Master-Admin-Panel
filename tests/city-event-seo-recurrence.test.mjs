import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";

mock.module("server-only", { namedExports: {} });

const { recurringScheduleIsCurrent, evaluateEventRecurrence } = await import("../lib/city-agent/event-seo-audit.ts");

test("an active recurring schedule keeps a recurring event current after its seed occurrence", () => {
  const schedule = {
    status: "active",
    starts_on: "2026-07-31",
    ends_on: "2026-12-31",
    timezone: "Europe/Berlin",
    expires_at: "2026-12-31T23:59:59+01:00",
  };

  assert.equal(recurringScheduleIsCurrent(schedule, new Date("2026-08-19T08:00:00Z")), true);
  assert.equal(recurringScheduleIsCurrent(schedule, new Date("2027-01-02T08:00:00Z")), false);
});

test("an expired or inactive recurring schedule cannot mask an expired event", () => {
  const schedule = {
    status: "archived",
    starts_on: "2026-07-31",
    ends_on: "2026-12-31",
    timezone: "Europe/Berlin",
    expires_at: "2026-12-31T23:59:59+01:00",
  };

  assert.equal(recurringScheduleIsCurrent(schedule, new Date("2026-08-19T08:00:00Z")), false);
});

test("recurrence gate reports active recurring events without inventing an end time", () => {
  const result = evaluateEventRecurrence({
    event: { id: "market", title: "Wochenmarkt", end_date: "2026-07-31T10:00:00Z" },
    schedules: [{
      status: "active",
      frequency: "weekly",
      weekdays: [5],
      starts_on: "2026-07-31",
      ends_on: "2026-12-31",
      timezone: "Europe/Berlin",
      expires_at: "2026-12-31T23:59:59+01:00",
    }],
    now: new Date("2026-08-21T08:00:00Z"),
  });

  assert.deepEqual(result, {
    hasSchedule: true,
    activeScheduleCount: 1,
    invalidScheduleCount: 0,
    expiredScheduleCount: 0,
    unknownEndTime: false,
  });
});

test("recurrence gate keeps a missing one-time end time explicitly unknown", () => {
  const result = evaluateEventRecurrence({
    event: { id: "serenade", title: "Bläser-Serenade", end_date: null },
    schedules: [],
    now: new Date("2026-08-21T08:00:00Z"),
  });

  assert.equal(result.unknownEndTime, true);
  assert.equal(result.hasSchedule, false);
});

test("freshness audit consumes the same recurrence gate", async () => {
  const source = await readFile(new URL("../lib/city-agent/freshness-audit.ts", import.meta.url), "utf8");

  assert.match(source, /evaluateEventRecurrence/);
  assert.match(source, /eventRecurrence/);
  assert.match(source, /city_event_schedules/);
});

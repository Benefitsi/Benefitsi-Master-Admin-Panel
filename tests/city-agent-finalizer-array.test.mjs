import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../../Benefitsi-Database/supabase/migrations/20260821150000_city_agent_finalizer_array_fix.sql",
  import.meta.url,
);

test("finalizer appends each reason as text[] instead of concatenating a scalar", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const functionBody = sql.slice(
    sql.indexOf("create or replace function public.finalize_city_agent_shadow_window"),
    sql.indexOf("revoke all on function public.finalize_city_agent_shadow_window"),
  );

  assert.ok(functionBody.includes("v_reasons text[] := array[]::text[]"));
  assert.equal(
    (functionBody.match(/v_reasons := array_append\(v_reasons,/g) ?? []).length,
    8,
  );
  assert.doesNotMatch(functionBody, /v_reasons := v_reasons \|\|/);

  const reasons = [];
  reasons.push("Kein Full-City-Audit im Shadow-Fenster abgeschlossen.");
  assert.deepEqual(reasons, ["Kein Full-City-Audit im Shadow-Fenster abgeschlossen."]);
});

test("finalizer repair keeps the observation guardrails and does not create a new window", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /operating_mode = 'SHADOW'/);
  assert.match(sql, /auto_publish_enabled = false/);
  assert.doesNotMatch(sql, /insert into public\.city_agent_shadow_windows/);
  assert.doesNotMatch(sql, /delete from public\.city_agent_shadow_windows/);
  assert.doesNotMatch(sql, /truncate/i);
});

begin;

select pg_catalog.set_config('benefitsi.runtime_gate_checks', '0', true);

do $gate$
declare
  v_checks integer := pg_catalog.current_setting('benefitsi.runtime_gate_checks')::integer;
begin
  if pg_catalog.to_regclass('public.benefitsi_agent_runtime_snapshots') is null then
    raise exception 'gate check failed: private runtime snapshot table exists';
  end if;
  v_checks := v_checks + 1;

  if (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.benefitsi_agent_runtime_snapshots'::regclass
  ) is distinct from true then
    raise exception 'gate check failed: runtime snapshot table has RLS enabled';
  end if;
  v_checks := v_checks + 1;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'benefitsi_agent_runtime_snapshots'
  ) is distinct from true then
    raise exception 'gate check failed: runtime snapshot table exposes no RLS policy';
  end if;
  v_checks := v_checks + 1;

  if (not pg_catalog.has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'select')) is distinct from true then
    raise exception 'gate check failed: anon cannot select snapshots';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'insert')) is distinct from true then
    raise exception 'gate check failed: anon cannot insert snapshots';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'update')) is distinct from true then
    raise exception 'gate check failed: anon cannot update snapshots';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'delete')) is distinct from true then
    raise exception 'gate check failed: anon cannot delete snapshots';
  end if;
  v_checks := v_checks + 1;

  if (not pg_catalog.has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'select')) is distinct from true then
    raise exception 'gate check failed: authenticated cannot select snapshots';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'insert')) is distinct from true then
    raise exception 'gate check failed: authenticated cannot insert snapshots';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'update')) is distinct from true then
    raise exception 'gate check failed: authenticated cannot update snapshots';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'delete')) is distinct from true then
    raise exception 'gate check failed: authenticated cannot delete snapshots';
  end if;
  v_checks := v_checks + 1;

  if pg_catalog.has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'select') is distinct from true then
    raise exception 'gate check failed: service role can read snapshots';
  end if;
  v_checks := v_checks + 1;
  if pg_catalog.has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'insert') is distinct from true then
    raise exception 'gate check failed: service role can insert snapshots';
  end if;
  v_checks := v_checks + 1;
  if pg_catalog.has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'update') is distinct from true then
    raise exception 'gate check failed: service role can update snapshots';
  end if;
  v_checks := v_checks + 1;
  if (
    not pg_catalog.has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'delete')
    and not pg_catalog.has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'truncate')
    and not pg_catalog.has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'references')
    and not pg_catalog.has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'trigger')
  ) is distinct from true then
    raise exception 'gate check failed: service role has no inherited destructive or schema-level table privileges';
  end if;
  v_checks := v_checks + 1;

  if pg_catalog.to_regprocedure('public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)') is null then
    raise exception 'gate check failed: runtime snapshot RPC exists';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_function_privilege('anon', 'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)', 'execute')) is distinct from true then
    raise exception 'gate check failed: anon cannot execute snapshot RPC';
  end if;
  v_checks := v_checks + 1;
  if (not pg_catalog.has_function_privilege('authenticated', 'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)', 'execute')) is distinct from true then
    raise exception 'gate check failed: authenticated cannot execute snapshot RPC';
  end if;
  v_checks := v_checks + 1;
  if pg_catalog.has_function_privilege('service_role', 'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)', 'execute') is distinct from true then
    raise exception 'gate check failed: service role can execute snapshot RPC';
  end if;
  v_checks := v_checks + 1;
  if not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'record_benefitsi_agent_runtime_snapshot'
      and grantee = 'PUBLIC'
  ) is distinct from true then
    raise exception 'gate check failed: PUBLIC has no snapshot RPC execute grant';
  end if;
  v_checks := v_checks + 1;
  if (
    select not prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)'::regprocedure
  ) is distinct from true then
    raise exception 'gate check failed: snapshot RPC is security invoker';
  end if;
  v_checks := v_checks + 1;
  if (
    select coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
    from pg_catalog.pg_proc
    where oid = 'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)'::regprocedure
  ) is distinct from true then
    raise exception 'gate check failed: snapshot RPC fixes search_path to empty';
  end if;
  v_checks := v_checks + 1;

  perform pg_catalog.set_config('benefitsi.runtime_gate_checks', v_checks::text, true);
end
$gate$;

do $gate$
declare
  v_checks integer := pg_catalog.current_setting('benefitsi.runtime_gate_checks')::integer;
  v_now timestamptz := pg_catalog.date_trunc('second', pg_catalog.now());
  v_context jsonb;
  v_schedule jsonb;
  v_profile jsonb;
  v_snapshot jsonb;
  v_case record;
  v_result boolean;
begin
  v_context := pg_catalog.jsonb_build_object(
    'path', 'SOUL.md',
    'exists', true,
    'chars', 1,
    'limit', null,
    'sha256', pg_catalog.repeat('a', 64),
    'modifiedAt', '2026-09-21T20:00:00Z',
    'loadedBy', 'system'
  );
  v_schedule := pg_catalog.jsonb_build_object(
    'id', 'test-schedule',
    'source', 'hermes',
    'enabled', false,
    'cadence', '15 7 * * * Europe/Berlin',
    'lastRunAt', '2026-09-21T20:00:00Z',
    'lastStatus', 'error'
  );
  v_profile := pg_catalog.jsonb_build_object(
    'id', 'test-profile',
    'scope', 'benefitsi',
    'purpose', 'Transactional database test',
    'provider', null,
    'model', null,
    'citySlug', null,
    'automation', 'unknown',
    'contextFiles', pg_catalog.jsonb_build_array(v_context),
    'schedules', pg_catalog.jsonb_build_array(v_schedule)
  );
  v_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'hostId', 'm1-benefitsi',
    'observedAt', pg_catalog.to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'collectorVersion', 'test',
    'profiles', pg_catalog.jsonb_build_array(v_profile)
  );

  for v_case in
    select *
    from (
      values
        (
          'RPC rejects non-allowlisted host',
          'other-host'::text,
          v_now,
          v_snapshot,
          'invalid agent runtime host'::text
        ),
        (
          'RPC rejects unsupported schema version',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{schemaVersion}', '2'::jsonb),
          'agent runtime snapshot contract is invalid'
        ),
        (
          'RPC rejects snapshots above 128 KiB',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{collectorVersion}', pg_catalog.to_jsonb(pg_catalog.repeat('x', 132000))),
          'invalid agent runtime snapshot'
        ),
        (
          'RPC rejects more than 64 profiles',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{profiles}', (select pg_catalog.jsonb_agg('{}'::jsonb) from pg_catalog.generate_series(1, 65))),
          'agent runtime snapshot contract is invalid'
        ),
        (
          'RPC rejects more than 16 context files per profile',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', (select pg_catalog.jsonb_agg('{}'::jsonb) from pg_catalog.generate_series(1, 17)))
            )
          ),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC rejects more than 16 schedules per profile',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{schedules}', (select pg_catalog.jsonb_agg('{}'::jsonb) from pg_catalog.generate_series(1, 17)))
            )
          ),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC rejects observations over five minutes in the future',
          'm1-benefitsi',
          v_now + interval '6 minutes',
          pg_catalog.jsonb_set(
            v_snapshot,
            '{observedAt}',
            pg_catalog.to_jsonb(pg_catalog.to_char((v_now + interval '6 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
          ),
          'agent runtime observation time is too far in the future'
        ),
        (
          'RPC rejects a mismatched snapshot host',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{hostId}', '"other-host"'::jsonb),
          'agent runtime snapshot contract is invalid'
        ),
        (
          'RPC rejects invalid embedded observation timestamps',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{observedAt}', '"not-a-date"'::jsonb),
          'agent runtime embedded observation time is invalid'
        ),
        (
          'RPC rejects impossible embedded observation dates',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{observedAt}', '"2026-02-30T20:00:00Z"'::jsonb),
          'agent runtime embedded observation time is invalid'
        ),
        (
          'RPC rejects embedded observation offsets beyond fourteen hours',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{observedAt}', '"2026-09-21T20:00:00+14:01"'::jsonb),
          'agent runtime embedded observation time is invalid'
        ),
        (
          'RPC rejects JSON null profile scope',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{profiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_profile, '{scope}', 'null'::jsonb))),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC rejects JSON null profile automation',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{profiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_profile, '{automation}', 'null'::jsonb))),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC rejects JSON null context path',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_context, '{path}', 'null'::jsonb)))
            )
          ),
          'agent runtime context file contract is invalid'
        ),
        (
          'RPC rejects JSON null context loading mode',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_context, '{loadedBy}', 'null'::jsonb)))
            )
          ),
          'agent runtime context file contract is invalid'
        ),
        (
          'RPC rejects JSON null schedule source',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{schedules}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_schedule, '{source}', 'null'::jsonb)))
            )
          ),
          'agent runtime schedule contract is invalid'
        ),
        (
          'RPC rejects whitespace-only collector versions using JavaScript trim characters',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{collectorVersion}', pg_catalog.to_jsonb(pg_catalog.chr(9) || U&'\00A0' || pg_catalog.chr(10))),
          'agent runtime snapshot contract is invalid'
        ),
        (
          'RPC counts non-BMP collector versions as two UTF-16 code units',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(v_snapshot, '{collectorVersion}', pg_catalog.to_jsonb(pg_catalog.repeat('a', 79) || U&'\+01F600')),
          'agent runtime snapshot contract is invalid'
        ),
        (
          'RPC rejects whitespace-only profile purposes using JavaScript trim characters',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_profile, '{purpose}', pg_catalog.to_jsonb(pg_catalog.chr(10) || U&'\00A0')))
          ),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC counts non-BMP profile purposes as two UTF-16 code units',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_profile, '{purpose}', pg_catalog.to_jsonb(pg_catalog.repeat('a', 499) || U&'\+01F600')))
          ),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC rejects whitespace-only providers',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_profile, '{provider}', pg_catalog.to_jsonb(pg_catalog.chr(9) || pg_catalog.chr(10))))
          ),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC counts non-BMP nullable strings as two UTF-16 code units',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_profile, '{provider}', pg_catalog.to_jsonb(pg_catalog.repeat('a', 119) || U&'\+01F600')))
          ),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC rejects whitespace-only models',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_profile, '{model}', pg_catalog.to_jsonb(U&'\00A0'::text)))
          ),
          'agent runtime profile contract is invalid'
        ),
        (
          'RPC rejects whitespace-only cadence strings',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{schedules}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_schedule, '{cadence}', pg_catalog.to_jsonb(pg_catalog.chr(10)))))
            )
          ),
          'agent runtime schedule contract is invalid'
        ),
        (
          'RPC rejects whitespace-only last statuses',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{schedules}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_schedule, '{lastStatus}', pg_catalog.to_jsonb(U&'\00A0'::text))))
            )
          ),
          'agent runtime schedule contract is invalid'
        ),
        (
          'RPC rejects chars above the JavaScript safe integer limit',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_context, '{chars}', '9007199254740992'::jsonb)))
            )
          ),
          'agent runtime context file contract is invalid'
        ),
        (
          'RPC rejects limits above the JavaScript safe integer limit',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_context, '{limit}', '9007199254740992'::jsonb)))
            )
          ),
          'agent runtime context file contract is invalid'
        ),
        (
          'RPC rejects impossible context dates',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_context, '{modifiedAt}', '"2025-02-29T10:00:00Z"'::jsonb)))
            )
          ),
          'agent runtime context file contract is invalid'
        ),
        (
          'RPC rejects impossible context times',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_context, '{modifiedAt}', '"2026-09-21T24:00:00Z"'::jsonb)))
            )
          ),
          'agent runtime context file contract is invalid'
        ),
        (
          'RPC rejects context offsets beyond fourteen hours',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{contextFiles}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_context, '{modifiedAt}', '"2026-09-21T10:00:00-14:01"'::jsonb)))
            )
          ),
          'agent runtime context file contract is invalid'
        ),
        (
          'RPC rejects impossible schedule dates',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{schedules}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_schedule, '{lastRunAt}', '"2026-04-31T10:00:00Z"'::jsonb)))
            )
          ),
          'agent runtime schedule contract is invalid'
        ),
        (
          'RPC rejects impossible schedule times',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{schedules}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_schedule, '{lastRunAt}', '"2026-09-21T10:60:00Z"'::jsonb)))
            )
          ),
          'agent runtime schedule contract is invalid'
        ),
        (
          'RPC rejects schedule offsets beyond fourteen hours',
          'm1-benefitsi',
          v_now,
          pg_catalog.jsonb_set(
            v_snapshot,
            '{profiles}',
            pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_set(v_profile, '{schedules}', pg_catalog.jsonb_build_array(pg_catalog.jsonb_set(v_schedule, '{lastRunAt}', '"2026-09-21T10:00:00+15:00"'::jsonb)))
            )
          ),
          'agent runtime schedule contract is invalid'
        )
    ) as cases(name, host_id, observed_at, snapshot, expected_message)
  loop
    begin
      perform public.record_benefitsi_agent_runtime_snapshot(
        v_case.host_id,
        v_case.observed_at,
        v_case.snapshot
      );
      raise exception 'gate check failed: % did not raise', v_case.name;
    exception
      when sqlstate '22023' then
        if sqlerrm is distinct from v_case.expected_message then
          raise exception 'gate check failed: % raised message %, expected %',
            v_case.name, sqlerrm, v_case.expected_message;
        end if;
    end;
    v_checks := v_checks + 1;
  end loop;

  v_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'hostId', 'm1-benefitsi',
    'observedAt', '2026-09-21T22:00:00+02:00',
    'collectorVersion', pg_catalog.repeat('a', 78) || U&'\+01F600',
    'profiles', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          v_profile,
          '{contextFiles}',
          pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_set(
              pg_catalog.jsonb_set(v_context, '{chars}', '9007199254740991'::jsonb),
              '{modifiedAt}',
              '"2024-02-29T23:59:59+14:00"'::jsonb
            )
          )
        ),
        '{schedules}',
        pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_set(v_schedule, '{lastRunAt}', '"2024-02-29T23:59:59-14:00"'::jsonb)
        )
      )
    )
  );
  v_result := public.record_benefitsi_agent_runtime_snapshot(
    'm1-benefitsi',
    '2026-09-21T20:00:00Z'::timestamptz,
    v_snapshot
  );
  if v_result is distinct from true then
    raise exception 'gate check failed: valid offset-equivalent instants and UTF-16 boundary were rejected';
  end if;
  v_checks := v_checks + 1;

  v_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'hostId', 'm1-benefitsi',
    'observedAt', pg_catalog.to_char((v_now - interval '1 minute') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'collectorVersion', 'initial',
    'profiles', '[]'::jsonb
  );
  v_result := public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', v_now - interval '1 minute', v_snapshot);
  if v_result is distinct from true then
    raise exception 'gate check failed: RPC did not record a valid snapshot';
  end if;
  v_checks := v_checks + 1;

  v_snapshot := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(v_snapshot, '{observedAt}', pg_catalog.to_jsonb(pg_catalog.to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
    '{collectorVersion}',
    '"newer"'::jsonb
  );
  v_result := public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', v_now, v_snapshot);
  if v_result is distinct from true then
    raise exception 'gate check failed: RPC did not replace an older snapshot';
  end if;
  v_checks := v_checks + 1;

  v_snapshot := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(v_snapshot, '{observedAt}', pg_catalog.to_jsonb(pg_catalog.to_char((v_now - interval '2 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
    '{collectorVersion}',
    '"stale"'::jsonb
  );
  v_result := public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', v_now - interval '2 minutes', v_snapshot);
  if v_result is distinct from false then
    raise exception 'gate check failed: RPC replaced a newer observation with an older one';
  end if;
  v_checks := v_checks + 1;

  if (
    select snapshot ->> 'collectorVersion'
    from public.benefitsi_agent_runtime_snapshots
    where host_id = 'm1-benefitsi'
  ) is distinct from 'newer' then
    raise exception 'gate check failed: monotonic write did not leave the newer snapshot intact';
  end if;
  v_checks := v_checks + 1;

  perform pg_catalog.set_config('benefitsi.runtime_gate_checks', v_checks::text, true);
end
$gate$;

set local role service_role;

do $gate$
declare
  v_checks integer := pg_catalog.current_setting('benefitsi.runtime_gate_checks')::integer;
  v_observed_at timestamptz := pg_catalog.date_trunc('second', pg_catalog.now()) + interval '1 second';
  v_snapshot jsonb;
  v_result boolean;
begin
  v_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'hostId', 'm1-benefitsi',
    'observedAt', pg_catalog.to_char(v_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'collectorVersion', 'service-role-write',
    'profiles', '[]'::jsonb
  );
  v_result := public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', v_observed_at, v_snapshot);
  if v_result is distinct from true then
    raise exception 'gate check failed: service role could not write through the RPC';
  end if;
  v_checks := v_checks + 1;

  if (
    select snapshot ->> 'collectorVersion'
    from public.benefitsi_agent_runtime_snapshots
    where host_id = 'm1-benefitsi'
  ) is distinct from 'service-role-write' then
    raise exception 'gate check failed: service role could not read the written snapshot';
  end if;
  v_checks := v_checks + 1;

  perform pg_catalog.set_config('benefitsi.runtime_gate_checks', v_checks::text, true);
end
$gate$;

reset role;

set local role anon;

do $gate$
declare
  v_checks integer := pg_catalog.current_setting('benefitsi.runtime_gate_checks')::integer;
begin
  begin
    perform 1 from public.benefitsi_agent_runtime_snapshots;
    raise exception 'gate check failed: anon direct table read was allowed';
  exception
    when sqlstate '42501' then null;
  end;
  v_checks := v_checks + 1;

  begin
    perform public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', pg_catalog.now(), '{}'::jsonb);
    raise exception 'gate check failed: anon RPC execution was allowed';
  exception
    when sqlstate '42501' then null;
  end;
  v_checks := v_checks + 1;

  perform pg_catalog.set_config('benefitsi.runtime_gate_checks', v_checks::text, true);
end
$gate$;

reset role;

set local role authenticated;

do $gate$
declare
  v_checks integer := pg_catalog.current_setting('benefitsi.runtime_gate_checks')::integer;
begin
  begin
    perform 1 from public.benefitsi_agent_runtime_snapshots;
    raise exception 'gate check failed: authenticated direct table read was allowed';
  exception
    when sqlstate '42501' then null;
  end;
  v_checks := v_checks + 1;

  begin
    perform public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', pg_catalog.now(), '{}'::jsonb);
    raise exception 'gate check failed: authenticated RPC execution was allowed';
  exception
    when sqlstate '42501' then null;
  end;
  v_checks := v_checks + 1;

  perform pg_catalog.set_config('benefitsi.runtime_gate_checks', v_checks::text, true);
end
$gate$;

reset role;

do $gate$
declare
  v_checks integer := pg_catalog.current_setting('benefitsi.runtime_gate_checks')::integer;
begin
  if v_checks is distinct from 66 then
    raise exception 'gate check failed: executed % checks, expected 66', v_checks;
  end if;
end
$gate$;

rollback;

select 66 as check_count, 'complete'::text as status;

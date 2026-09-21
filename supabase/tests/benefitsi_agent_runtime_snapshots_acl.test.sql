begin;

select plan(43);

select has_table(
  'public',
  'benefitsi_agent_runtime_snapshots',
  'private runtime snapshot table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.benefitsi_agent_runtime_snapshots'::regclass
  ),
  'runtime snapshot table has RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'benefitsi_agent_runtime_snapshots'
  ),
  'runtime snapshot table exposes no RLS policy'
);

select ok(not has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'select'), 'anon cannot select snapshots');
select ok(not has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'insert'), 'anon cannot insert snapshots');
select ok(not has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'update'), 'anon cannot update snapshots');
select ok(not has_table_privilege('anon', 'public.benefitsi_agent_runtime_snapshots', 'delete'), 'anon cannot delete snapshots');
select ok(not has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'select'), 'authenticated cannot select snapshots');
select ok(not has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'insert'), 'authenticated cannot insert snapshots');
select ok(not has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'update'), 'authenticated cannot update snapshots');
select ok(not has_table_privilege('authenticated', 'public.benefitsi_agent_runtime_snapshots', 'delete'), 'authenticated cannot delete snapshots');
select ok(has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'select'), 'service role can read snapshots');
select ok(has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'insert'), 'service role can insert snapshots');
select ok(has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'update'), 'service role can update snapshots');
select ok(
  not has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'delete')
    and not has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'truncate')
    and not has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'references')
    and not has_table_privilege('service_role', 'public.benefitsi_agent_runtime_snapshots', 'trigger'),
  'service role has no inherited destructive or schema-level table privileges'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)',
    'execute'
  ),
  'anon cannot execute snapshot RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)',
    'execute'
  ),
  'authenticated cannot execute snapshot RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)',
    'execute'
  ),
  'service role can execute snapshot RPC'
);
select ok(
  not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'record_benefitsi_agent_runtime_snapshot'
      and grantee = 'PUBLIC'
  ),
  'PUBLIC has no snapshot RPC execute grant'
);
select ok(
  not (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)'::regprocedure
  ),
  'snapshot RPC is security invoker'
);
select ok(
  (
    select coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
    from pg_catalog.pg_proc
    where oid = 'public.record_benefitsi_agent_runtime_snapshot(text,timestamptz,jsonb)'::regprocedure
  ),
  'snapshot RPC fixes search_path to empty'
);

create function pg_temp.runtime_snapshot(
  observed_at timestamptz,
  profiles jsonb default '[]'::jsonb,
  collector_version text default 'test'
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'hostId', 'm1-benefitsi',
    'observedAt', to_char(observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'collectorVersion', collector_version,
    'profiles', profiles
  );
$$;

create function pg_temp.runtime_profile(
  context_files jsonb default '[]'::jsonb,
  schedules jsonb default '[]'::jsonb
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', 'test-profile',
    'scope', 'benefitsi',
    'purpose', 'Transactional database test',
    'provider', null,
    'model', null,
    'citySlug', null,
    'automation', 'unknown',
    'contextFiles', context_files,
    'schedules', schedules
  );
$$;

create function pg_temp.runtime_context()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'path', 'SOUL.md',
    'exists', true,
    'chars', 1,
    'limit', null,
    'sha256', repeat('a', 64),
    'modifiedAt', '2026-09-21T20:00:00Z',
    'loadedBy', 'system'
  );
$$;

create function pg_temp.runtime_schedule()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', 'test-schedule',
    'source', 'hermes',
    'enabled', false,
    'cadence', '15 7 * * * Europe/Berlin',
    'lastRunAt', '2026-09-21T20:00:00Z',
    'lastStatus', 'error'
  );
$$;

select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('other-host', now(), pg_temp.runtime_snapshot(now()))$$,
  '22023',
  'invalid agent runtime host',
  'RPC rejects non-allowlisted host'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), jsonb_build_object('schemaVersion', 2, 'hostId', 'm1-benefitsi', 'observedAt', '2026-01-01T00:00:00Z', 'collectorVersion', 'test', 'profiles', jsonb_build_array()))$$,
  '22023',
  'agent runtime snapshot contract is invalid',
  'RPC rejects unsupported schema version'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), '[]'::jsonb, repeat('x', 132000)))$$,
  '22023',
  'invalid agent runtime snapshot',
  'RPC rejects snapshots above 128 KiB'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), (select jsonb_agg('{}'::jsonb) from generate_series(1, 65))))$$,
  '22023',
  'agent runtime snapshot contract is invalid',
  'RPC rejects more than 64 profiles'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), jsonb_build_array(pg_temp.runtime_profile((select jsonb_agg('{}'::jsonb) from generate_series(1, 17)), '[]'::jsonb))))$$,
  '22023',
  'agent runtime profile contract is invalid',
  'RPC rejects more than 16 context files per profile'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), jsonb_build_array(pg_temp.runtime_profile('[]'::jsonb, (select jsonb_agg('{}'::jsonb) from generate_series(1, 17))))))$$,
  '22023',
  'agent runtime profile contract is invalid',
  'RPC rejects more than 16 schedules per profile'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now() + interval '6 minutes', pg_temp.runtime_snapshot(now() + interval '6 minutes'))$$,
  '22023',
  'agent runtime observation time is too far in the future',
  'RPC rejects observations over five minutes in the future'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), jsonb_set(pg_temp.runtime_snapshot(now()), '{hostId}', '"other-host"'::jsonb))$$,
  '22023',
  'agent runtime snapshot contract is invalid',
  'RPC rejects a mismatched snapshot host'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), jsonb_set(pg_temp.runtime_snapshot(now()), '{observedAt}', '"not-a-date"'::jsonb))$$,
  '22023',
  'agent runtime embedded observation time is invalid',
  'RPC rejects invalid embedded observation timestamps'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), jsonb_build_array(jsonb_set(pg_temp.runtime_profile(), '{scope}', 'null'::jsonb))))$$,
  '22023',
  'agent runtime profile contract is invalid',
  'RPC rejects JSON null profile scope'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), jsonb_build_array(jsonb_set(pg_temp.runtime_profile(), '{automation}', 'null'::jsonb))))$$,
  '22023',
  'agent runtime profile contract is invalid',
  'RPC rejects JSON null profile automation'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), jsonb_build_array(pg_temp.runtime_profile(jsonb_build_array(jsonb_set(pg_temp.runtime_context(), '{path}', 'null'::jsonb)), '[]'::jsonb))))$$,
  '22023',
  'agent runtime context file contract is invalid',
  'RPC rejects JSON null context path'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), jsonb_build_array(pg_temp.runtime_profile(jsonb_build_array(jsonb_set(pg_temp.runtime_context(), '{loadedBy}', 'null'::jsonb)), '[]'::jsonb))))$$,
  '22023',
  'agent runtime context file contract is invalid',
  'RPC rejects JSON null context loading mode'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), pg_temp.runtime_snapshot(now(), jsonb_build_array(pg_temp.runtime_profile('[]'::jsonb, jsonb_build_array(jsonb_set(pg_temp.runtime_schedule(), '{source}', 'null'::jsonb))))))$$,
  '22023',
  'agent runtime schedule contract is invalid',
  'RPC rejects JSON null schedule source'
);

select is(
  public.record_benefitsi_agent_runtime_snapshot(
    'm1-benefitsi',
    now() - interval '1 minute',
    pg_temp.runtime_snapshot(now() - interval '1 minute', '[]'::jsonb, 'initial')
  ),
  true,
  'RPC records a valid snapshot'
);
select is(
  public.record_benefitsi_agent_runtime_snapshot(
    'm1-benefitsi',
    now(),
    pg_temp.runtime_snapshot(now(), '[]'::jsonb, 'newer')
  ),
  true,
  'RPC replaces an older snapshot with a newer observation'
);
select is(
  public.record_benefitsi_agent_runtime_snapshot(
    'm1-benefitsi',
    now() - interval '2 minutes',
    pg_temp.runtime_snapshot(now() - interval '2 minutes', '[]'::jsonb, 'stale')
  ),
  false,
  'RPC refuses to replace a newer observation with an older one'
);
select is(
  (select snapshot ->> 'collectorVersion' from public.benefitsi_agent_runtime_snapshots where host_id = 'm1-benefitsi'),
  'newer',
  'monotonic write leaves the newer snapshot intact'
);

set local role anon;
select throws_ok(
  $$select * from public.benefitsi_agent_runtime_snapshots$$,
  '42501',
  null,
  'anon direct table read is denied'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), '{}'::jsonb)$$,
  '42501',
  null,
  'anon RPC execution is denied'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select * from public.benefitsi_agent_runtime_snapshots$$,
  '42501',
  null,
  'authenticated direct table read is denied'
);
select throws_ok(
  $$select public.record_benefitsi_agent_runtime_snapshot('m1-benefitsi', now(), '{}'::jsonb)$$,
  '42501',
  null,
  'authenticated RPC execution is denied'
);
reset role;

select * from finish();
rollback;

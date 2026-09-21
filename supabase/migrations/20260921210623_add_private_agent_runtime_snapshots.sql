create table public.benefitsi_agent_runtime_snapshots (
  host_id text primary key,
  observed_at timestamptz not null,
  schema_version integer not null,
  snapshot jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.benefitsi_agent_runtime_snapshots enable row level security;

revoke all on table public.benefitsi_agent_runtime_snapshots from public, anon, authenticated, service_role;
grant select, insert, update on table public.benefitsi_agent_runtime_snapshots to service_role;

create or replace function public.record_benefitsi_agent_runtime_snapshot(
  p_host_id text,
  p_observed_at timestamptz,
  p_snapshot jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_embedded_observed_at timestamptz;
  v_js_whitespace constant text := ' '
    || pg_catalog.chr(9) || pg_catalog.chr(10) || pg_catalog.chr(11)
    || pg_catalog.chr(12) || pg_catalog.chr(13)
    || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_timestamp_pattern constant text := '^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,9})?(Z|([+-])([0-9]{2}):([0-9]{2}))$';
  v_timestamp_parts text[];
  v_collector_version_utf16_length integer;
  v_written boolean;
begin
  if p_host_id is distinct from 'm1-benefitsi' then
    raise exception using errcode = '22023', message = 'invalid agent runtime host';
  end if;

  if p_observed_at is null or not pg_catalog.isfinite(p_observed_at) then
    raise exception using errcode = '22023', message = 'invalid agent runtime observation time';
  end if;

  if p_observed_at > pg_catalog.now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'agent runtime observation time is too far in the future';
  end if;

  if p_snapshot is null
     or pg_catalog.jsonb_typeof(p_snapshot) <> 'object'
     or pg_catalog.octet_length(p_snapshot::text) > 131072 then
    raise exception using errcode = '22023', message = 'invalid agent runtime snapshot';
  end if;

  if not (p_snapshot ?& array['schemaVersion', 'hostId', 'observedAt', 'collectorVersion', 'profiles'])
     or p_snapshot - array['schemaVersion', 'hostId', 'observedAt', 'collectorVersion', 'profiles'] <> '{}'::jsonb
     or p_snapshot -> 'schemaVersion' <> '1'::jsonb
     or p_snapshot ->> 'hostId' is distinct from p_host_id
     or pg_catalog.jsonb_typeof(p_snapshot -> 'collectorVersion') <> 'string'
     or pg_catalog.jsonb_typeof(p_snapshot -> 'profiles') <> 'array'
     or (
       pg_catalog.jsonb_typeof(p_snapshot -> 'profiles') = 'array'
       and pg_catalog.jsonb_array_length(p_snapshot -> 'profiles') > 64
     ) then
    raise exception using errcode = '22023', message = 'agent runtime snapshot contract is invalid';
  end if;

  select pg_catalog.length(p_snapshot ->> 'collectorVersion') + pg_catalog.count(*)
  into v_collector_version_utf16_length
  from pg_catalog.unnest(pg_catalog.string_to_array(p_snapshot ->> 'collectorVersion', null)) as codepoint(value)
  where pg_catalog.octet_length(codepoint.value) = 4;

  if pg_catalog.length(pg_catalog.btrim(p_snapshot ->> 'collectorVersion', v_js_whitespace)) < 1
     or v_collector_version_utf16_length > 80 then
    raise exception using errcode = '22023', message = 'agent runtime snapshot contract is invalid';
  end if;

  if pg_catalog.jsonb_typeof(p_snapshot -> 'observedAt') <> 'string' then
    raise exception using errcode = '22023', message = 'agent runtime embedded observation time is invalid';
  end if;

  v_timestamp_parts := pg_catalog.regexp_match(p_snapshot ->> 'observedAt', v_timestamp_pattern);

  if v_timestamp_parts is null
     or v_timestamp_parts[4]::integer > 23
     or v_timestamp_parts[5]::integer > 59
     or v_timestamp_parts[6]::integer > 59
     or coalesce(v_timestamp_parts[10]::integer, 0) > 14
     or coalesce(v_timestamp_parts[11]::integer, 0) > 59
     or (
       coalesce(v_timestamp_parts[10]::integer, 0) = 14
       and coalesce(v_timestamp_parts[11]::integer, 0) <> 0
     ) then
    raise exception using errcode = '22023', message = 'agent runtime embedded observation time is invalid';
  end if;

  begin
    v_embedded_observed_at := (p_snapshot ->> 'observedAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'agent runtime embedded observation time is invalid';
  end;

  if v_embedded_observed_at is distinct from p_observed_at then
    raise exception using errcode = '22023', message = 'agent runtime observation times do not match';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'profiles') as profile(value)
    where pg_catalog.jsonb_typeof(profile.value) <> 'object'
       or not (profile.value ?& array[
         'id', 'scope', 'purpose', 'provider', 'model', 'citySlug',
         'automation', 'contextFiles', 'schedules'
       ])
       or profile.value - array[
         'id', 'scope', 'purpose', 'provider', 'model', 'citySlug',
         'automation', 'contextFiles', 'schedules'
       ] <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(profile.value -> 'id') <> 'string'
       or (profile.value ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
       or pg_catalog.jsonb_typeof(profile.value -> 'scope') <> 'string'
       or profile.value ->> 'scope' not in ('benefitsi', 'general', 'other', 'unknown')
       or pg_catalog.jsonb_typeof(profile.value -> 'purpose') <> 'string'
       or pg_catalog.length(pg_catalog.btrim(profile.value ->> 'purpose', v_js_whitespace)) < 1
       or pg_catalog.length(profile.value ->> 'purpose') + (
         select pg_catalog.count(*)
         from pg_catalog.unnest(pg_catalog.string_to_array(profile.value ->> 'purpose', null)) as codepoint(value)
         where pg_catalog.octet_length(codepoint.value) = 4
       ) > 500
       or pg_catalog.jsonb_typeof(profile.value -> 'provider') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(profile.value -> 'provider') = 'string'
         and (
           pg_catalog.length(pg_catalog.btrim(profile.value ->> 'provider', v_js_whitespace)) < 1
           or pg_catalog.length(profile.value ->> 'provider') + (
             select pg_catalog.count(*)
             from pg_catalog.unnest(pg_catalog.string_to_array(profile.value ->> 'provider', null)) as codepoint(value)
             where pg_catalog.octet_length(codepoint.value) = 4
           ) > 120
         )
       )
       or pg_catalog.jsonb_typeof(profile.value -> 'model') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(profile.value -> 'model') = 'string'
         and (
           pg_catalog.length(pg_catalog.btrim(profile.value ->> 'model', v_js_whitespace)) < 1
           or pg_catalog.length(profile.value ->> 'model') + (
             select pg_catalog.count(*)
             from pg_catalog.unnest(pg_catalog.string_to_array(profile.value ->> 'model', null)) as codepoint(value)
             where pg_catalog.octet_length(codepoint.value) = 4
           ) > 120
         )
       )
       or pg_catalog.jsonb_typeof(profile.value -> 'citySlug') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(profile.value -> 'citySlug') = 'string'
         and (profile.value ->> 'citySlug') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
       )
       or pg_catalog.jsonb_typeof(profile.value -> 'automation') <> 'string'
       or profile.value ->> 'automation' not in ('scheduled', 'manual', 'unknown')
       or case
         when pg_catalog.jsonb_typeof(profile.value -> 'contextFiles') = 'array'
           then pg_catalog.jsonb_array_length(profile.value -> 'contextFiles') > 16
         else true
       end
       or case
         when pg_catalog.jsonb_typeof(profile.value -> 'schedules') = 'array'
           then pg_catalog.jsonb_array_length(profile.value -> 'schedules') > 16
         else true
       end
  ) then
    raise exception using errcode = '22023', message = 'agent runtime profile contract is invalid';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct profile.value ->> 'id')
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'profiles') as profile(value)
  ) then
    raise exception using errcode = '22023', message = 'agent runtime profile ids must be unique';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'profiles') as profile(value)
    cross join lateral pg_catalog.jsonb_array_elements(profile.value -> 'contextFiles') as context_file(value)
    left join lateral (
      select pg_catalog.regexp_match(context_file.value ->> 'modifiedAt', v_timestamp_pattern) as parts
    ) as modified_at on true
    where pg_catalog.jsonb_typeof(context_file.value) <> 'object'
       or not (context_file.value ?& array['path', 'exists', 'chars', 'limit', 'sha256', 'modifiedAt', 'loadedBy'])
       or context_file.value - array['path', 'exists', 'chars', 'limit', 'sha256', 'modifiedAt', 'loadedBy'] <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(context_file.value -> 'path') <> 'string'
       or context_file.value ->> 'path' not in ('AGENTS.md', 'SOUL.md', 'USER.md', 'MEMORY.md', 'memories/MEMORY.md')
       or pg_catalog.jsonb_typeof(context_file.value -> 'exists') <> 'boolean'
       or pg_catalog.jsonb_typeof(context_file.value -> 'chars') not in ('number', 'null')
       or (
         pg_catalog.jsonb_typeof(context_file.value -> 'chars') = 'number'
         and (
           (context_file.value ->> 'chars') !~ '^[0-9]+$'
           or (context_file.value ->> 'chars')::numeric > 9007199254740991
         )
       )
       or pg_catalog.jsonb_typeof(context_file.value -> 'limit') not in ('number', 'null')
       or (
         pg_catalog.jsonb_typeof(context_file.value -> 'limit') = 'number'
         and (
           (context_file.value ->> 'limit') !~ '^[0-9]+$'
           or (context_file.value ->> 'limit')::numeric > 9007199254740991
         )
       )
       or pg_catalog.jsonb_typeof(context_file.value -> 'sha256') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(context_file.value -> 'sha256') = 'string'
         and (context_file.value ->> 'sha256') !~ '^[A-Fa-f0-9]{64}$'
       )
       or pg_catalog.jsonb_typeof(context_file.value -> 'modifiedAt') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(context_file.value -> 'modifiedAt') = 'string'
         and (
           modified_at.parts is null
           or modified_at.parts[1]::integer < 1
           or modified_at.parts[2]::integer not between 1 and 12
           or modified_at.parts[3]::integer < 1
           or modified_at.parts[3]::integer > case modified_at.parts[2]::integer
             when 2 then case
               when modified_at.parts[1]::integer % 4 = 0
                and (modified_at.parts[1]::integer % 100 <> 0 or modified_at.parts[1]::integer % 400 = 0)
                 then 29 else 28 end
             when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30
             else 31
           end
           or modified_at.parts[4]::integer > 23
           or modified_at.parts[5]::integer > 59
           or modified_at.parts[6]::integer > 59
           or coalesce(modified_at.parts[10]::integer, 0) > 14
           or coalesce(modified_at.parts[11]::integer, 0) > 59
           or (
             coalesce(modified_at.parts[10]::integer, 0) = 14
             and coalesce(modified_at.parts[11]::integer, 0) <> 0
           )
         )
       )
       or pg_catalog.jsonb_typeof(context_file.value -> 'loadedBy') <> 'string'
       or context_file.value ->> 'loadedBy' not in ('system', 'reference', 'unknown')
       or (
         context_file.value -> 'exists' = 'false'::jsonb
         and (
           context_file.value -> 'chars' <> 'null'::jsonb
           or context_file.value -> 'sha256' <> 'null'::jsonb
           or context_file.value -> 'modifiedAt' <> 'null'::jsonb
         )
       )
  ) then
    raise exception using errcode = '22023', message = 'agent runtime context file contract is invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'profiles') as profile(value)
    where (
      select pg_catalog.count(*) <> pg_catalog.count(distinct context_file.value ->> 'path')
      from pg_catalog.jsonb_array_elements(profile.value -> 'contextFiles') as context_file(value)
    )
  ) then
    raise exception using errcode = '22023', message = 'agent runtime context paths must be unique';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'profiles') as profile(value)
    cross join lateral pg_catalog.jsonb_array_elements(profile.value -> 'schedules') as schedule(value)
    left join lateral (
      select pg_catalog.regexp_match(schedule.value ->> 'lastRunAt', v_timestamp_pattern) as parts
    ) as last_run_at on true
    where pg_catalog.jsonb_typeof(schedule.value) <> 'object'
       or not (schedule.value ?& array['id', 'source', 'enabled', 'cadence', 'lastRunAt', 'lastStatus'])
       or schedule.value - array['id', 'source', 'enabled', 'cadence', 'lastRunAt', 'lastStatus'] <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(schedule.value -> 'id') <> 'string'
       or (schedule.value ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
       or pg_catalog.jsonb_typeof(schedule.value -> 'source') <> 'string'
       or schedule.value ->> 'source' not in ('hermes', 'launchd')
       or pg_catalog.jsonb_typeof(schedule.value -> 'enabled') not in ('boolean', 'null')
       or pg_catalog.jsonb_typeof(schedule.value -> 'cadence') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(schedule.value -> 'cadence') = 'string'
         and (
           pg_catalog.length(pg_catalog.btrim(schedule.value ->> 'cadence', v_js_whitespace)) < 1
           or pg_catalog.length(schedule.value ->> 'cadence') + (
             select pg_catalog.count(*)
             from pg_catalog.unnest(pg_catalog.string_to_array(schedule.value ->> 'cadence', null)) as codepoint(value)
             where pg_catalog.octet_length(codepoint.value) = 4
           ) > 200
         )
       )
       or pg_catalog.jsonb_typeof(schedule.value -> 'lastRunAt') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(schedule.value -> 'lastRunAt') = 'string'
         and (
           last_run_at.parts is null
           or last_run_at.parts[1]::integer < 1
           or last_run_at.parts[2]::integer not between 1 and 12
           or last_run_at.parts[3]::integer < 1
           or last_run_at.parts[3]::integer > case last_run_at.parts[2]::integer
             when 2 then case
               when last_run_at.parts[1]::integer % 4 = 0
                and (last_run_at.parts[1]::integer % 100 <> 0 or last_run_at.parts[1]::integer % 400 = 0)
                 then 29 else 28 end
             when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30
             else 31
           end
           or last_run_at.parts[4]::integer > 23
           or last_run_at.parts[5]::integer > 59
           or last_run_at.parts[6]::integer > 59
           or coalesce(last_run_at.parts[10]::integer, 0) > 14
           or coalesce(last_run_at.parts[11]::integer, 0) > 59
           or (
             coalesce(last_run_at.parts[10]::integer, 0) = 14
             and coalesce(last_run_at.parts[11]::integer, 0) <> 0
           )
         )
       )
       or pg_catalog.jsonb_typeof(schedule.value -> 'lastStatus') not in ('string', 'null')
       or (
         pg_catalog.jsonb_typeof(schedule.value -> 'lastStatus') = 'string'
         and (
           pg_catalog.length(pg_catalog.btrim(schedule.value ->> 'lastStatus', v_js_whitespace)) < 1
           or pg_catalog.length(schedule.value ->> 'lastStatus') + (
             select pg_catalog.count(*)
             from pg_catalog.unnest(pg_catalog.string_to_array(schedule.value ->> 'lastStatus', null)) as codepoint(value)
             where pg_catalog.octet_length(codepoint.value) = 4
           ) > 160
         )
       )
  ) then
    raise exception using errcode = '22023', message = 'agent runtime schedule contract is invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'profiles') as profile(value)
    where (
      select pg_catalog.count(*) <> pg_catalog.count(distinct (schedule.value ->> 'source', schedule.value ->> 'id'))
      from pg_catalog.jsonb_array_elements(profile.value -> 'schedules') as schedule(value)
    )
  ) then
    raise exception using errcode = '22023', message = 'agent runtime schedule ids must be unique per source';
  end if;

  with upserted as (
    insert into public.benefitsi_agent_runtime_snapshots (
      host_id,
      observed_at,
      schema_version,
      snapshot,
      received_at
    ) values (
      p_host_id,
      p_observed_at,
      1,
      p_snapshot,
      pg_catalog.now()
    )
    on conflict (host_id) do update
    set observed_at = excluded.observed_at,
        schema_version = excluded.schema_version,
        snapshot = excluded.snapshot,
        received_at = pg_catalog.now()
    where public.benefitsi_agent_runtime_snapshots.observed_at < excluded.observed_at
    returning 1
  )
  select exists(select 1 from upserted) into v_written;

  return v_written;
end;
$$;

revoke all on function public.record_benefitsi_agent_runtime_snapshot(text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_benefitsi_agent_runtime_snapshot(text, timestamptz, jsonb)
  to service_role;

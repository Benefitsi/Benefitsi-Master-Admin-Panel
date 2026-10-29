-- City-agent pull tick: fail hung automation jobs without HTTP 400, and
-- time out city_agent_runs that stay 'running'.
--
-- Apply this migration before or with the app deploy. It does not update
-- city_agent_sources, city controls, auto-publish, or social-source flags.
-- Do not run the optional next_check_at repair from the pull request as
-- part of this migration; that is a separate, explicit data change.
--
-- fail_automation_job keeps the 3-argument call used by Hermes. The new
-- p_claimed_before argument defaults to null. A call that still holds its
-- claim fails or requeues that claim, same as before. A job that is already
-- queued or terminal is returned unchanged so PostgREST answers HTTP 200
-- instead of HTTP 400 "Automation job is not held by this agent". A claim
-- held by a different agent profile still raises that exception.
-- When p_claimed_before is set, a newer claim (claimed_at after that
-- instant) is left untouched and returned. Callers must read the returned
-- status; HTTP 200 alone does not prove this call changed the job.
--
-- recover_stale_city_agent_runs is scheduled every 15 minutes. The daily
-- Vercel tick also recovers stale runs, but a daily tick cannot by itself
-- keep a killed worker from leaving a run in 'running' for a day.

drop function if exists public.fail_automation_job(uuid, text, text, timestamp with time zone);
drop function if exists public.fail_automation_job(uuid, text, text);

create function public.fail_automation_job(
  p_job_id uuid,
  p_agent_profile text,
  p_error_code text,
  p_claimed_before timestamp with time zone default null
) returns public.automation_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.automation_jobs%rowtype;
  v_retry boolean;
  v_profile text := left(trim(coalesce(p_agent_profile, '')), 160);
begin
  update public.automation_jobs
  set
    status = case when attempts < max_attempts then 'queued' else 'failed' end,
    error_code = left(coalesce(nullif(trim(p_error_code), ''), 'agent_error'), 160),
    available_at = case
      when attempts < max_attempts then now() + make_interval(mins => least(60, attempts * 5))
      else available_at
    end,
    lease_until = null,
    updated_at = now()
  where public.automation_jobs.id = p_job_id
    and public.automation_jobs.status = 'claimed'
    and public.automation_jobs.agent_profile = v_profile
    and (
      p_claimed_before is null
      or public.automation_jobs.claimed_at is null
      or public.automation_jobs.claimed_at <= p_claimed_before
    )
  returning * into v_job;

  if found then
    v_retry := v_job.status = 'queued';
    insert into public.automation_job_audit (
      job_id,
      action,
      actor_type,
      actor_profile,
      details
    )
    values (
      p_job_id,
      case when v_retry then 'retry_scheduled' else 'agent_failed' end,
      'agent',
      v_profile,
      jsonb_build_object('error_code', v_job.error_code, 'attempts', v_job.attempts)
    );
    return v_job;
  end if;

  select * into v_job from public.automation_jobs where id = p_job_id;
  if not found then
    raise exception 'Automation job is not held by this agent';
  end if;

  if v_job.status = 'claimed' and v_job.agent_profile is distinct from v_profile then
    raise exception 'Automation job is not held by this agent';
  end if;

  return v_job;
end;
$function$;

comment on function public.fail_automation_job(uuid, text, text, timestamp with time zone) is
  'Fail or requeue the caller''s current claim. Returns an already queued or terminal job, or a newer claim when p_claimed_before is set, without raising. Still raises when another profile holds the claim or the job does not exist.';

revoke all on function public.fail_automation_job(uuid, text, text, timestamp with time zone) from public;
revoke all on function public.fail_automation_job(uuid, text, text, timestamp with time zone) from anon, authenticated;
grant execute on function public.fail_automation_job(uuid, text, text, timestamp with time zone) to service_role;

create or replace function public.recover_stale_city_agent_runs(
  p_max_age interval default interval '30 minutes',
  p_max_runs integer default 20
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_age interval := greatest(coalesce(p_max_age, interval '30 minutes'), interval '5 minutes');
  v_limit integer := greatest(1, least(coalesce(p_max_runs, 20), 50));
  v_before timestamptz;
  v_run public.city_agent_runs%rowtype;
  v_job public.automation_jobs%rowtype;
  v_profile text;
  v_outcome text;
  v_recovered uuid[] := array[]::uuid[];
  v_updated uuid;
begin
  if v_age > interval '6 hours' then
    v_age := interval '6 hours';
  end if;
  v_before := now() - v_age;

  for v_run in
    select *
    from public.city_agent_runs
    where status = 'running'
      and started_at < v_before
    order by started_at
    limit v_limit
    for update skip locked
  loop
    v_updated := null;
    update public.city_agent_runs
    set
      status = 'failed',
      error_code = 'stale_run',
      error_summary = 'Run wurde wegen überschrittener Lease-Zeit kontrolliert beendet.',
      finished_at = now(),
      updated_at = now()
    where id = v_run.id
      and status = 'running'
    returning id into v_updated;

    if v_updated is null then
      continue;
    end if;

    v_outcome := 'leave_missing';
    if v_run.job_id is not null then
      select * into v_job from public.automation_jobs where id = v_run.job_id;
      if not found then
        v_outcome := 'leave_missing';
      else
        v_profile := left(trim(coalesce(v_run.orchestrator_profile, 'ben')), 160);
        if v_job.status <> 'claimed' then
          v_outcome := 'leave_terminal';
        elsif v_job.agent_profile is distinct from v_profile then
          v_outcome := 'leave_other_agent';
        elsif v_job.claimed_at is not null and v_job.claimed_at > v_run.started_at + interval '2 minutes' then
          v_outcome := 'leave_reclaimed';
        else
          v_outcome := 'fail_held_claim';
          begin
            v_job := public.fail_automation_job(
              v_run.job_id,
              v_profile,
              'stale_city_agent_run',
              v_run.started_at + interval '2 minutes'
            );
            if v_job.status = 'claimed' then
              v_outcome := 'leave_reclaimed';
            elsif v_job.status not in ('queued', 'failed') then
              v_outcome := 'leave_terminal';
            end if;
          exception
            when others then
              v_outcome := 'fail_rejected';
          end;
        end if;
      end if;
    end if;

    insert into public.city_agent_run_audit (
      run_id,
      action,
      actor_type,
      actor_profile,
      details
    )
    values (
      v_run.id,
      'failed',
      'system',
      'automation-scheduler',
      jsonb_build_object(
        'reason', 'stale_run',
        'staleBefore', v_before,
        'jobDisposition', v_outcome,
        'protected_action_executed', false
      )
    );

    v_recovered := array_append(v_recovered, v_run.id);
  end loop;

  return jsonb_build_object(
    'staleBefore', v_before,
    'recoveredCount', coalesce(cardinality(v_recovered), 0),
    'recoveredRunIds', to_jsonb(v_recovered)
  );
end;
$function$;

comment on function public.recover_stale_city_agent_runs(interval, integer) is
  'Fail city_agent_runs left running past the age bound. Fails the linked automation job only when that same claim is still held.';

revoke all on function public.recover_stale_city_agent_runs(interval, integer) from public;
revoke all on function public.recover_stale_city_agent_runs(interval, integer) from anon, authenticated;
grant execute on function public.recover_stale_city_agent_runs(interval, integer) to service_role;

do $schedule$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'city-agent-run-timeout';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'city-agent-run-timeout',
    '*/15 * * * *',
    $cmd$select public.recover_stale_city_agent_runs(interval '30 minutes', 20)$cmd$
  );
end
$schedule$;

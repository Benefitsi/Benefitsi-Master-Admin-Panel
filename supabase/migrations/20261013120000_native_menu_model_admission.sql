-- Native menu routes retain existing quota, period, no-replay and EUR budget guards.
-- No prices, credentials or acceptance are guessed or seeded.
begin;
create table private.partner_menu_model_cost_evidence (
 environment text not null,
 provider_id text not null check(provider_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$'),
 model_id text not null check(model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$'),
 max_context_tokens integer not null check(max_context_tokens between 1 and 10000000),
 input_eur_per_million numeric not null check(input_eur_per_million>0 and input_eur_per_million<'Infinity'::numeric),
 output_eur_per_million numeric not null check(output_eur_per_million>0 and output_eur_per_million<'Infinity'::numeric),
 checked_at timestamptz not null default now(),
 verified_until timestamptz not null check(pg_catalog.isfinite(verified_until)),
 evidence text not null check(length(btrim(evidence)) between 1 and 2000),
 adapter_accepted boolean not null default false,
 primary key(environment,provider_id,model_id),
 check(verified_until>checked_at and verified_until<=checked_at+interval '30 days')
);
alter table private.partner_menu_model_cost_evidence enable row level security;
revoke all on private.partner_menu_model_cost_evidence from public,anon,authenticated,service_role;
alter table private.partner_menu_ai_attempts add column provider_id text, add column model_id text, add column adapter_id text;

create function public.begin_partner_menu_ai_native_attempt(p_reservation_id uuid,p_provider text,p_model text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.partner_menu_ai_reservations;
 c private.partner_module_cost_evidence;
 m private.partner_menu_model_cost_evidence;
 a private.partner_menu_ai_attempts;
 cost numeric; n integer; total numeric;
begin
 if p_provider is null or p_model is null
   or p_provider !~ '^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$'
   or p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$' then
  raise exception 'invalid_menu_model_route' using errcode='22023';
 end if;
 select * into r from public.partner_menu_ai_reservations
 where id=p_reservation_id and environment=(select environment from private.partner_entitlement_runtime where singleton);
 if not found then raise exception 'reservation_not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.partner_id::text,8172));
 select * into r from public.partner_menu_ai_reservations
 where id=p_reservation_id and environment=(select environment from private.partner_entitlement_runtime where singleton) for update;
 if not found then raise exception 'reservation_not_found'; end if;
 select * into a from private.partner_menu_ai_attempts where reservation_id=r.id;
 if found then return jsonb_build_object('dispatch',false,'state',a.state); end if;
 if r.state<>'reserved' or r.period_end<=now()
  or private.resolve_partner_entitlements(r.partner_id)#>'{features,menu.ai_import}' is distinct from 'true'::jsonb then
  raise exception 'feature_denied';
 end if;
 select * into c from private.partner_module_cost_evidence cost_row
 where environment=r.environment and feature_key='menu.ai_import' and private.partner_module_cost_ready(cost_row);
 if not found then raise exception 'verified_cost_required'; end if;
 select * into m from private.partner_menu_model_cost_evidence
 where environment=r.environment and provider_id=p_provider and model_id=p_model
  and adapter_accepted and checked_at<=now() and verified_until>now();
 if not found then
  return jsonb_build_object('dispatch',false,'code','verified_provider_cost_required');
 end if;
 -- Bound the full verified model context, rather than guessing tokens from bytes.
 cost:=m.max_context_tokens*m.input_eur_per_million/1000000
       +24000*m.output_eur_per_million/1000000;
 if cost<=0 or cost>='Infinity'::numeric then raise exception 'invalid_provider_cost'; end if;
 select count(*),coalesce(sum(attempt.worst_cost_eur),0) into n,total
 from private.partner_menu_ai_attempts attempt
 join public.partner_menu_ai_reservations q on q.id=attempt.reservation_id
 where q.partner_id=r.partner_id and q.environment=r.environment and q.period_start=r.period_start;
 if n>=4 or total+cost>c.monthly_budget_eur then raise exception 'attempt_cost_budget_exceeded'; end if;
 insert into private.partner_menu_ai_attempts(reservation_id,worst_cost_eur,provider_id,model_id,adapter_id)
 values(r.id,cost,p_provider,p_model,'hermes-native-bounded-v2');
 return jsonb_build_object('dispatch',true,'state','uncertain','provider',p_provider,'model',p_model,
  'adapter','hermes-native-bounded-v2','service_tier','native-default','max_tokens',24000,
  'max_body_bytes',262144,'max_input_tokens',m.max_context_tokens,'worst_cost_eur',cost);
end $$;
revoke all on function public.begin_partner_menu_ai_native_attempt(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.begin_partner_menu_ai_native_attempt(uuid,text,text) to service_role;
commit;

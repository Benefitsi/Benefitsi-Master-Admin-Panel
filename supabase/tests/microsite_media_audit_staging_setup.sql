-- STAGING-ONLY prerequisite for klfaqrrbigjtcgrslkkl, which predates
-- partner_configuration_private. Execute together with the migration and
-- microsite_media_audit.test.sql in ONE transaction. The test's ROLLBACK
-- removes this entire setup and migration. Never apply this as a migration.
begin;

create schema partner_configuration_private;
revoke all on schema partner_configuration_private
  from public, anon, authenticated, service_role;

create table partner_configuration_private.history (
  id bigint generated always as identity primary key,
  partner_id uuid not null,
  entity_type text not null
    constraint history_entity_type_check check (
      entity_type = any (array['deals', 'partner_reward_milestones', 'partners'])),
  entity_id uuid not null,
  operation text not null
    constraint history_operation_check check (
      operation = any (array['snapshot', 'insert', 'update', 'delete'])),
  actor_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  before_value jsonb,
  after_value jsonb
);
alter table partner_configuration_private.history enable row level security;
revoke all on partner_configuration_private.history
  from public, anon, authenticated, service_role;

create function partner_configuration_private.reject_history_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'partner_history_append_only' using errcode = '42501';
end;
$$;
create trigger partner_history_append_only
before delete or update or truncate on partner_configuration_private.history
for each statement execute function partner_configuration_private.reject_history_mutation();

-- These are the existing production function bodies, before the new migration.
create function partner_configuration_private.configuration(p_table text, p_row jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select case when p_row is null then null when p_table = 'partners' then
    jsonb_build_object('id', p_row->'id', 'stamp_target', p_row->'stamp_target',
      'reward_text_primary', p_row->'reward_text_primary',
      'reward_text_secondary', p_row->'reward_text_secondary',
      'external_ordering_url', p_row->'external_ordering_url')
  else p_row-'updated_at'-'stock_remaining' end;
$$;
create function partner_configuration_private.capture_configuration()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare before_config jsonb; after_config jsonb; row_data jsonb;
begin
  if tg_op <> 'INSERT' then
    before_config := partner_configuration_private.configuration(tg_table_name, to_jsonb(old));
  end if;
  if tg_op <> 'DELETE' then
    after_config := partner_configuration_private.configuration(tg_table_name, to_jsonb(new));
  end if;
  if before_config is not distinct from after_config then return new; end if;
  row_data := coalesce(to_jsonb(new), to_jsonb(old));
  insert into partner_configuration_private.history
    (partner_id, entity_type, entity_id, operation, actor_id, before_value, after_value)
  values (case when tg_table_name = 'partners' then (row_data->>'id')::uuid
    else (row_data->>'partner_id')::uuid end,
    tg_table_name, (row_data->>'id')::uuid, lower(tg_op), auth.uid(),
    before_config, after_config);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create function partner_configuration_private.touch_configuration()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if partner_configuration_private.configuration(tg_table_name, to_jsonb(old))
    is distinct from partner_configuration_private.configuration(tg_table_name, to_jsonb(new)) then
    new.updated_at := clock_timestamp();
  elsif tg_table_name <> 'partners' then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger partner_configuration_history after insert or delete or update on public.partners
for each row execute function partner_configuration_private.capture_configuration();
create trigger zz_partner_configuration_revision before update on public.partners
for each row execute function partner_configuration_private.touch_configuration();
create trigger partner_configuration_history after insert or delete or update on public.deals
for each row execute function partner_configuration_private.capture_configuration();
create trigger zz_partner_configuration_revision before update on public.deals
for each row execute function partner_configuration_private.touch_configuration();
create trigger partner_configuration_history after insert or delete or update on public.partner_reward_milestones
for each row execute function partner_configuration_private.capture_configuration();
create trigger zz_partner_configuration_revision before update on public.partner_reward_milestones
for each row execute function partner_configuration_private.touch_configuration();

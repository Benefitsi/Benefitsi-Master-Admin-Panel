-- Keep the existing partner asset catalogued for review, but do not expose an
-- image as a verified Knobi business photo until the partner confirms it.

alter table public.city_media_audit
  drop constraint if exists city_media_audit_action;

alter table public.city_media_audit
  add constraint city_media_audit_action check (
    action in (
      'UPLOAD', 'UPDATE_METADATA', 'ASSIGN', 'UNASSIGN', 'REORDER',
      'LOCK', 'UNLOCK', 'REPLACE', 'ROLE_CHANGE', 'FOCAL_POINT',
      'ARCHIVE', 'DELETE_BLOCKED'
    )
  );

drop index if exists public.city_media_assignments_entity_id_role_uidx;
drop index if exists public.city_media_assignments_entity_key_role_uidx;

create unique index city_media_assignments_entity_id_role_uidx
  on public.city_media_assignments(city_id, entity_type, entity_id, role)
  where entity_id is not null and role <> 'GALLERY';

create unique index city_media_assignments_entity_key_role_uidx
  on public.city_media_assignments(city_id, entity_type, entity_key, role)
  where entity_id is null and entity_key is not null and role <> 'GALLERY';

do $$
declare
  target_asset record;
  assignment record;
  previous_asset jsonb;
  next_asset jsonb;
begin
  select a.*
    into target_asset
  from public.city_media_assets a
  join public.partners p on p.feature_card_url = a.public_url
  where p.slug = 'knobi-doener-und-pizza-haus'
  order by a.updated_at desc
  limit 1;

  if not found then
    raise notice 'No catalogued Knobi feature asset found; provenance cleanup skipped.';
    return;
  end if;

  previous_asset := to_jsonb(target_asset);

  for assignment in
    select * from public.city_media_assignments where media_asset_id = target_asset.id
  loop
    insert into public.city_media_audit (
      city_id, media_asset_id, assignment_id, action, entity_type,
      entity_id, entity_key, role, previous_state
    )
    values (
      assignment.city_id, assignment.media_asset_id, assignment.id, 'UNASSIGN',
      assignment.entity_type, assignment.entity_id, assignment.entity_key,
      assignment.role, to_jsonb(assignment)
    );

    delete from public.city_media_assignments where id = assignment.id;
  end loop;

  update public.city_media_assets
  set
    title = 'Unverifiziertes Partner-Asset · Knobi Döner und Pizza Haus',
    alt_text = null,
    provenance_note = 'Bestehendes Asset aus dem Partner-assets-Pfad. Die Relation zum aktiven Partnerdatensatz ist belegt; die aktuelle Sichtprüfung zeigt jedoch einen Burger und beweist kein echtes Knobi-Motiv. Fotograf, Copyright-Inhaber und Lizenz sind unbekannt. Nicht als öffentliches Knobi-Foto verwenden; Partnerbestätigung oder ein echtes Partnerbild ausstehend.',
    status = 'REVIEW'::public.city_media_status,
    updated_at = now()
  where id = target_asset.id
  returning to_jsonb(city_media_assets.*) into next_asset;

  insert into public.city_media_audit (
    city_id, media_asset_id, action, previous_state, next_state
  )
  values (target_asset.city_id, target_asset.id, 'UPDATE_METADATA', previous_asset, next_asset);
end;
$$;

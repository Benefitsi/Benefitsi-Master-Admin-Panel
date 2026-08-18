-- Catalog the existing, active Knobi partner image without copying or
-- inventing rights metadata. The source association is verified through the
-- partner record; photographer and license remain unknown until confirmed.

do $$
declare
  v_city_id uuid;
  v_partner_id uuid;
  v_source_url text;
  v_asset_id uuid;
  v_assignment_id uuid;
begin
  select c.id
    into v_city_id
    from public.cities c
   where c.slug = 'annweiler';

  select p.id, p.feature_card_url
    into v_partner_id, v_source_url
    from public.partners p
   where p.slug = 'knobi-doener-und-pizza-haus'
     and p.city_id = v_city_id
   limit 1;

  if v_city_id is null or v_partner_id is null or nullif(trim(v_source_url), '') is null then
    return;
  end if;

  select a.id
    into v_asset_id
    from public.city_media_assets a
   where a.public_url = v_source_url
   limit 1;

  if v_asset_id is null then
    insert into public.city_media_assets (
      city_id,
      storage_bucket,
      public_url,
      media_type,
      mime_type,
      file_size_bytes,
      title,
      alt_text,
      source_type,
      source_url,
      provenance_note,
      status
    )
    values (
      v_city_id,
      'partner-assets',
      v_source_url,
      'image',
      'image/png',
      823600,
      'Knobi Döner und Pizza Haus · bestehendes Partnerbild',
      'Döner bei Knobi Döner und Pizza Haus',
      'EXISTING_ASSET',
      v_source_url,
      'Bestehendes aktives Partner-Asset aus partner-assets. Die Zuordnung zum Partner ist über den aktiven Partnerdatensatz belegt; Fotograf, Copyright-Inhaber und Lizenz sind UNKNOWN und wurden nicht erfunden.',
      'PUBLISHED'
    )
    returning id into v_asset_id;
  end if;

  if not exists (
    select 1
      from public.city_media_assignments a
     where a.city_id = v_city_id
       and a.media_asset_id = v_asset_id
       and a.entity_type = 'BUSINESS'
       and a.entity_id = v_partner_id
       and a.role = 'HERO'
  ) then
    insert into public.city_media_assignments (
      city_id,
      media_asset_id,
      entity_type,
      entity_id,
      role,
      is_primary,
      manual_lock,
      created_by,
      updated_by
    )
    values (
      v_city_id,
      v_asset_id,
      'BUSINESS',
      v_partner_id,
      'HERO',
      true,
      true,
      null,
      null
    )
    returning id into v_assignment_id;

    insert into public.city_media_audit (
      city_id,
      media_asset_id,
      assignment_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      role,
      next_state
    )
    values (
      v_city_id,
      v_asset_id,
      v_assignment_id,
      'system-migration',
      'ASSIGN',
      'BUSINESS',
      v_partner_id,
      'HERO',
      jsonb_build_object('manual_lock', true, 'source_type', 'EXISTING_ASSET')
    );
  end if;
end;
$$;

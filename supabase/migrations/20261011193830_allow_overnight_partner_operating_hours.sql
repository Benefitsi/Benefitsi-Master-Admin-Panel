-- Support closing after midnight while validating overlap across days and the week boundary.
create or replace function public.save_partner_related_details(
  p_partner_id uuid,
  p_socials jsonb default null,
  p_opening_hours jsonb default null,
  p_holidays jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if auth.uid() is null or not coalesce(public.can_manage_partner_profile(p_partner_id), false) then
    raise exception 'partner_access_denied' using errcode = '42501';
  end if;
  -- Serialize replacements for the same partner. Table RLS and write guards
  -- still apply to every operation under the caller's own role.
  perform 1 from public.partners where id = p_partner_id for update;
  if not found then raise exception 'partner_not_found'; end if;

  if p_socials is not null then
    if jsonb_typeof(p_socials) is distinct from 'array' or jsonb_array_length(p_socials) > 5 then
      raise exception 'invalid_partner_socials';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(p_socials) as s(platform text, url text, handle text)
      where platform is null or platform not in ('facebook','instagram','tiktok','x','youtube')
        or nullif(btrim(handle), '') is null or nullif(btrim(url), '') is null
        or url !~ '^https?://' or length(handle) > 200
    ) or exists (
      select 1 from jsonb_to_recordset(p_socials) as s(platform text)
      group by platform having count(*) > 1
    ) then raise exception 'invalid_partner_socials'; end if;
    delete from public.partner_socials where partner_id = p_partner_id;
    insert into public.partner_socials (partner_id, platform, url, handle, sort_order)
      select p_partner_id, platform, url, handle, coalesce(sort_order, 0)
      from jsonb_to_recordset(p_socials) as s(platform text, url text, handle text, sort_order integer);
  end if;

  if p_opening_hours is not null then
    if jsonb_typeof(p_opening_hours) is distinct from 'array' then raise exception 'invalid_partner_hours'; end if;
    if exists (
      select 1 from jsonb_to_recordset(p_opening_hours)
        as h(weekday integer, opens_at time, closes_at time, is_closed boolean)
      where weekday is null or weekday not between 1 and 7 or is_closed is null
        or (is_closed and (opens_at is not null or closes_at is not null))
        or (not is_closed and (opens_at is null or closes_at is null
          or (closes_at = opens_at and not (opens_at = time '00:00' and closes_at = time '00:00'))))
    ) then raise exception 'invalid_partner_hours'; end if;
    if exists (
      select 1 from jsonb_to_recordset(p_opening_hours)
        as h(weekday integer, opens_at time, closes_at time, is_closed boolean)
      group by weekday having count(*) > 3
        or (count(*) > 1 and bool_or(is_closed or (opens_at = time '00:00' and closes_at = time '00:00')))
    ) or exists (
      -- Place each range on a continuous weekly timeline. Overnight endings
      -- fall on the following day; shifts also detect Sunday/Monday overlap.
      with ranges as (
        select position,
          ((value->>'weekday')::integer - 1) * 86400
            + extract(epoch from (value->>'opens_at')::time) as starts,
          ((value->>'weekday')::integer - 1) * 86400
            + extract(epoch from (value->>'closes_at')::time)
            + case when (value->>'closes_at')::time <= (value->>'opens_at')::time then 86400 else 0 end as ends
        from jsonb_array_elements(p_opening_hours) with ordinality r(value, position)
        where not (value->>'is_closed')::boolean
      )
      select 1 from ranges a join ranges b on a.position < b.position
      cross join (values (-604800), (0), (604800)) shifts(seconds)
      where a.starts < b.ends + shifts.seconds and b.starts + shifts.seconds < a.ends
    ) then raise exception 'overlapping_partner_hours'; end if;
    delete from public.partner_opening_hours where partner_id = p_partner_id;
    insert into public.partner_opening_hours (partner_id, weekday, opens_at, closes_at, label, is_closed, sort_order)
      select p_partner_id, weekday, opens_at, closes_at, label, is_closed, coalesce(sort_order, 0)
      from jsonb_to_recordset(p_opening_hours)
        as h(weekday integer, opens_at time, closes_at time, label text, is_closed boolean, sort_order integer);
  end if;

  if p_holidays is not null then
    if jsonb_typeof(p_holidays) is distinct from 'array' then raise exception 'invalid_partner_holidays'; end if;
    delete from public.partner_holidays where partner_id = p_partner_id;
    insert into public.partner_holidays (partner_id, holiday_date, label, is_closed, opens_at, closes_at, repeats_yearly)
      select p_partner_id, holiday_date, label, is_closed, opens_at, closes_at, coalesce(repeats_yearly, false)
      from jsonb_to_recordset(p_holidays)
        as h(holiday_date date, label text, is_closed boolean, opens_at time, closes_at time, repeats_yearly boolean);
  end if;

  return jsonb_build_object(
    'partner_id', p_partner_id,
    'socials', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order, s.id) from public.partner_socials s where s.partner_id = p_partner_id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(h) order by h.weekday, h.sort_order, h.id) from public.partner_opening_hours h where h.partner_id = p_partner_id), '[]'::jsonb),
    'holidays', coalesce((select jsonb_agg(to_jsonb(h) order by h.holiday_date, h.id) from public.partner_holidays h where h.partner_id = p_partner_id), '[]'::jsonb)
  );
end;
$function$;
revoke all on function public.save_partner_related_details(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_partner_related_details(uuid, jsonb, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';

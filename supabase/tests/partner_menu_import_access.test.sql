-- Run with the SQL runner as postgres. All users, flags and menus are rolled back.
begin;
do $test$
declare
  admin_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  partner_a uuid := gen_random_uuid();
  partner_b uuid := gen_random_uuid();
  menu_a uuid := gen_random_uuid();
  menu_b uuid := gen_random_uuid();
  category_a uuid := gen_random_uuid();
  category_b uuid := gen_random_uuid();
  item_a uuid := gen_random_uuid();
  affected integer;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.partner_feature_flags'::regclass) then
    raise exception 'Feature flags must use RLS';
  end if;
  if has_table_privilege('anon', 'public.partner_feature_flags', 'select')
    or has_table_privilege('authenticated', 'public.partner_feature_flags', 'truncate') then
    raise exception 'Feature flag table grants are too broad';
  end if;

  insert into auth.users (id, email) values
    (admin_id, admin_id || '@menu-test.invalid'), (owner_id, owner_id || '@menu-test.invalid'),
    (staff_id, staff_id || '@menu-test.invalid'), (other_id, other_id || '@menu-test.invalid');
  insert into public.users (id, is_admin) values (admin_id, true), (owner_id, false), (staff_id, false), (other_id, false)
    on conflict (id) do update set is_admin = excluded.is_admin;
  insert into public.partners (id, owner_id, name, slug, category, stamp_target, status, is_active) values
    (partner_a, owner_id, 'Menu access test A', partner_a::text, array['Restaurant'], 10, 'draft', false),
    (partner_b, other_id, 'Menu access test B', partner_b::text, array['Restaurant'], 10, 'draft', false);
  insert into public.partner_staff (partner_id, user_id, role, active) values (partner_a, staff_id, 'admin', true);

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  begin
    insert into public.partner_feature_flags (partner_id, feature_key, enabled) values (partner_a, 'menu_ai_import', true);
    raise exception 'Owner enabled their own feature';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.menus (id, partner_id, name, status) values (menu_a, partner_a, 'Menu A', 'published');
    raise exception 'Owner created a menu without a flag';
  exception when insufficient_privilege then null; end;

  reset role;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  insert into public.partner_feature_flags (partner_id, feature_key, enabled, updated_by) values
    (partner_a, 'menu_ai_import', true, admin_id), (partner_b, 'menu_ai_import', true, admin_id);
  insert into public.menus (id, partner_id, name, status) values (menu_b, partner_b, 'Menu B', 'published');
  insert into public.menu_categories (id, menu_id, name, slug) values (category_b, menu_b, 'Other category', category_b::text);

  reset role;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  if (select count(*) from public.partner_feature_flags) <> 1
    or not (select enabled from public.partner_feature_flags where partner_id = partner_a) then
    raise exception 'Owner must read only their own flag';
  end if;
  update public.partner_feature_flags set enabled = false where partner_id = partner_a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Owner changed an existing feature flag'; end if;
  begin
    insert into public.partner_feature_flags (partner_id, feature_key, enabled) values (partner_a, 'menu_ai_import', false)
      on conflict (partner_id, feature_key) do update set enabled = excluded.enabled;
    raise exception 'Owner bypassed flag permissions using upsert';
  exception when insufficient_privilege then null; end;

  insert into public.menus (id, partner_id, name, status) values (menu_a, partner_a, 'Menu A', 'published');
  insert into public.menu_categories (id, menu_id, name, slug) values (category_a, menu_a, 'Own category', category_a::text);
  insert into public.menu_items (id, menu_id, category_id, name, price) values (item_a, menu_a, category_a, 'Test soup', 6.5);
  if (select count(*) from public.menu_items where id = item_a and price = 6.5) <> 1 then
    raise exception 'Enabled owner cannot read back imported item';
  end if;
  update public.menu_items set price = 7 where id = item_a;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Enabled owner cannot correct imported item'; end if;
  begin
    insert into public.menu_items (menu_id, category_id, name, price) values (menu_b, category_b, 'Forbidden', 1);
    raise exception 'Owner wrote to another partner menu';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.menu_items (menu_id, category_id, name, price) values (menu_a, category_b, 'Cross-menu category', 1);
    raise exception 'Owner linked an item to a foreign category';
  exception when insufficient_privilege then null; end;
  begin
    update public.menus set partner_id = partner_b where id = menu_a;
    raise exception 'Owner moved menu to another partner';
  exception when insufficient_privilege then null; end;
  update public.menu_items set name = 'Foreign update' where menu_id = menu_b;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Owner modified a foreign menu'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', staff_id::text, true);
  set local role authenticated;
  if exists (select 1 from public.partner_feature_flags) then raise exception 'Staff can read feature flags'; end if;
  begin
    insert into public.menu_items (menu_id, category_id, name, price) values (menu_a, category_a, 'Staff write', 1);
    raise exception 'Staff inherited owner import rights';
  exception when insufficient_privilege then null; end;

  reset role;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  update public.partner_feature_flags set enabled = false where partner_id = partner_a;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Admin could not revoke access'; end if;
  -- Admin retains menu rights even when the flag is off.
  update public.menu_items set price = 8 where id = item_a;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Revocation removed admin access'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  begin
    insert into public.menu_items (menu_id, category_id, name, price) values (menu_a, category_a, 'Revoked write', 1);
    raise exception 'Revoked owner can still import';
  exception when insufficient_privilege then null; end;
  update public.menu_items set price = 9 where id = item_a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Revoked owner can still update'; end if;
  delete from public.menus where id = menu_a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Revoked owner can delete menu'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  update public.partner_feature_flags set enabled = true where partner_id = partner_a;
  reset role;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  delete from public.menu_items where id = item_a;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Import rollback cannot remove own item'; end if;
  delete from public.menu_categories where id = category_a;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Import rollback cannot remove own category'; end if;
  delete from public.menus where id = menu_a;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Import rollback cannot remove own new menu'; end if;
  reset role;
end
$test$;
rollback;
select 'Partner menu access checks passed; all fixtures rolled back.' as result;

alter table public.menu_items
  add column if not exists addons jsonb not null default '[]'::jsonb;

comment on column public.menu_items.addons is
  'Optional purchasable add-ons stored as objects with title, optional description, and cost.';

alter table public.menu_items
  drop constraint if exists menu_items_addons_is_array;

alter table public.menu_items
  add constraint menu_items_addons_is_array
  check (jsonb_typeof(addons) = 'array');

notify pgrst, 'reload schema';

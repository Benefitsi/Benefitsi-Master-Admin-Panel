-- Menu categories can have an optional image stored in the existing
-- partner-assets bucket. The application stores the public object URL here.
alter table if exists public.menu_categories
  add column if not exists image_url text;

comment on column public.menu_categories.image_url is
  'Optional public Supabase Storage URL for the menu category image.';

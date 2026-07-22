-- The Knobi scraper import included prices for its add-ons. Keep the cost
-- property available for future editing, but make every currently imported
-- add-on on this exact menu free. No other item fields or menus are changed.
update public.menu_items as menu_item
set
  addons = (
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(entry.addon) = 'object'
            then jsonb_set(entry.addon, '{cost}', '0'::jsonb, true)
          else entry.addon
        end
        order by entry.position
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(menu_item.addons)
      with ordinality as entry(addon, position)
  ),
  updated_at = now()
where menu_item.menu_id = '30bda361-4b6f-4a8a-b0e1-70015737883f'
  and jsonb_typeof(menu_item.addons) = 'array'
  and jsonb_array_length(menu_item.addons) > 0;

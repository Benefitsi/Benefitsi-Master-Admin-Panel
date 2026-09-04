with mapping(alias, canonical) as (
  values
    ('doner kebab', 'Doner Kebab'),
    ('doner', 'Doner Kebab'),
    ('doener', 'Doner Kebab'),
    ('döner', 'Doner Kebab'),
    ('shawarma', 'Doner Kebab'),
    ('pizza', 'Pizza'),
    ('restaurant', 'Restaurant'),
    ('bowl', 'Bowl'),
    ('bowls', 'Bowl'),
    ('falafel', 'Falafel'),
    ('chinese', 'Chinese'),
    ('snack bar', 'Snack Bar'),
    ('imbiss', 'Snack Bar'),
    ('soup', 'Soup'),
    ('soups', 'Soup'),
    ('suppe', 'Soup'),
    ('suppen', 'Soup'),
    ('cafe', 'Cafe'),
    ('café', 'Cafe'),
    ('grill', 'Grill'),
    ('burger', 'Burger'),
    ('burgers', 'Burger'),
    ('thai', 'Thai'),
    ('sushi', 'Sushi'),
    ('asian', 'Asian'),
    ('asia', 'Asian'),
    ('asiatisch', 'Asian'),
    ('indian', 'Indian'),
    ('inder', 'Indian'),
    ('indisch', 'Indian'),
    ('ice cream', 'Ice Cream'),
    ('eis', 'Ice Cream'),
    ('breakfast', 'Breakfast'),
    ('frühstück', 'Breakfast'),
    ('fruehstueck', 'Breakfast'),
    ('greek', 'Greek'),
    ('grieche', 'Greek'),
    ('griechisch', 'Greek'),
    ('tarte flambee', 'Tarte Flambee'),
    ('flammkuchen', 'Tarte Flambee'),
    ('bar', 'Bar'),
    ('winery', 'Winery'),
    ('weingut', 'Winery'),
    ('bistro', 'Bistro'),
    ('pastry shop', 'Pastry Shop'),
    ('bakery', 'Bakery'),
    ('bäckerei', 'Bakery'),
    ('baeckerei', 'Bakery'),
    ('shisha', 'Shisha'),
    ('juice bar', 'Juice Bar'),
    ('saftladen', 'Juice Bar'),
    ('tea house', 'Tea House'),
    ('teehaus', 'Tea House'),
    ('catering', 'Catering'),
    ('butcher', 'Butcher'),
    ('butcher shop', 'Butcher'),
    ('metzgerei', 'Butcher'),
    ('cake shop', 'Cake Shop'),
    ('konditorei', 'Cake Shop'),
    ('hotel', 'Hotel'),
    ('car wash', 'Car Wash'),
    ('waschanlage', 'Car Wash'),
    ('parking garage', 'Parking Garage'),
    ('parkhaus', 'Parking Garage'),
    ('taxi', 'Taxi'),
    ('hairdresser', 'Hairdresser'),
    ('friseur', 'Hairdresser'),
    ('barber', 'Barber'),
    ('massage', 'Massage'),
    ('spa', 'Spa'),
    ('nail salon', 'Nail Salon'),
    ('nagelstudio', 'Nail Salon'),
    ('beauty salon', 'Beauty Salon'),
    ('kosmetik', 'Beauty Salon'),
    ('swimming pool', 'Swimming Pool'),
    ('schwimmbad', 'Swimming Pool'),
    ('zoo', 'Zoo'),
    ('cinema', 'Cinema'),
    ('kino', 'Cinema'),
    ('leisure center', 'Leisure Center'),
    ('freizeitcenter', 'Leisure Center'),
    ('climbing gym', 'Climbing Gym'),
    ('kletterhalle', 'Climbing Gym'),
    ('laser tag', 'Laser Tag'),
    ('trampoline park', 'Trampoline Park'),
    ('trampolin', 'Trampoline Park'),
    ('play park', 'Play Park'),
    ('spielpark', 'Play Park'),
    ('escape room', 'Escape Room'),
    ('mini golf', 'Mini Golf'),
    ('minigolf', 'Mini Golf'),
    ('go-karting', 'Go-Karting'),
    ('kart', 'Go-Karting'),
    ('bowling', 'Bowling'),
    ('crossfit', 'CrossFit'),
    ('gym', 'Gym'),
    ('castle', 'Castle'),
    ('burg', 'Castle'),
    ('attraction', 'Attraction'),
    ('adventure', 'Adventure'),
    ('experiences', 'Experiences'),
    ('erlebnisse', 'Experiences')
),
canonical_categories(category) as (
  select distinct canonical from mapping
),
normalized as (
  select
    p.id,
    nullif(
      array(
        select dedup.mapped
        from (
          select mapped, min(ord) as first_ord
          from (
            select
              u.ord,
              coalesce(m.canonical, btrim(u.raw)) as mapped
            from unnest(coalesce(p.category, '{}'::text[])) with ordinality as u(raw, ord)
            left join mapping m
              on lower(btrim(u.raw)) = m.alias
          ) mapped_rows
          where mapped in (select category from canonical_categories)
          group by mapped
          order by first_ord
        ) dedup
      ),
      '{}'::text[]
    ) as category
  from public.partners p
  where p.category is not null
)
update public.partners p
set category = normalized.category
from normalized
where normalized.id = p.id;

update public.partners
set category = array_replace(category, 'Doner', 'Döner')
where category @> array['Doner']::text[];

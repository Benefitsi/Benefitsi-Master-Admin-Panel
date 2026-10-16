CREATE OR REPLACE FUNCTION private.microsite_public_query_key_v1(value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare result text := ''; i integer := 1; code integer; part text;
begin
  while i <= length(value) loop
    part := substr(value,i,3);
    if part ~ '^%[0-9a-fA-F]{2}$' then
      code := get_byte(decode(substr(part,2),'hex'),0);
      -- Sensitive parameter names are ASCII; other bytes cannot form them.
      result := result || case when code between 1 and 127 then chr(code) else part end;
      i := i+3;
    else
      result := result || case when substr(value,i,1)='+' then ' ' else substr(value,i,1) end;
      i := i+1;
    end if;
  end loop;
  return result;
end;
$function$
;

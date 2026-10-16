CREATE OR REPLACE FUNCTION private.microsite_public_element_v1(key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select key = any(array[
    'branding.partnerName','branding.logo','contact.logo','footer.benefitsiLogo',
    'content.aboutHeroImageUrl','content.aboutIngredientImageUrl','content.aboutLocationImageUrl','content.aboutPrepImageUrl',
    'content.aboutSlogan','content.aboutTextSecond','content.aboutThanks','content.aboutSignature',
    'content.contactSlogan','content.contactSocialText','content.contactMap','content.contactOpening',
    'content.appKicker','content.appPhoneScreenshotUrl','content.appQrLabel','content.appQrText',
    'content.ecosystemKicker','content.ecosystemHeadline','content.ecosystemText',
    'content.faqHeadline','content.faqLabel','content.faqText','content.menuFeaturedItemKey',
    'content.socialFeed.enabled','content.socialFeed.platform','content.socialFeedHeadline','content.socialFeedKicker','stamps.description',
    'navigation.deals','navigation.stempelkarte','navigation.speisekarte','navigation.ueber-uns','navigation.app','navigation.kontakt'
  ]) or key ~ '^(social\.(instagram|facebook|tiktok|youtube|whatsapp|website|google|linkedin)\.(enabled|iconUrl|label|url)|content\.socialFeed\.(instagram|tiktok)\.[0-5]\.url|content\.menuItem\.[a-z0-9_-]+\.(imageUrl|showImage)|content\.faq\.[0-5]\.(question|answer)|content\.aboutValue\.[0-3]|content\.appBenefit\.[0-2]|content\.contact\.(address|phone|opening)|hero\.services\.[0-9]+\.(label|icon|description)|deals\.topDealBullets\.[0-9]+)$'
  or (array_length(string_to_array(key,'.'),1)=2 and coalesce((private.microsite_public_fields_v1()->split_part(key,'.',1)) ? split_part(key,'.',2),false));
$function$
;

CREATE OR REPLACE FUNCTION private.microsite_public_fields_v1()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select '{
    "branding":["accent","accentSecondary","accentTertiary","logoUrl","partnerBadgeUrl"],
    "hero":["headline","slogan","locationText","openingText","backgroundImageUrl","badgeText","primaryButtonLabel","secondaryButtonLabel"],
    "deals":["label","headline","slogan","description","illustrationUrl","topDealLabel","topDealHeadline","topDealDescription","topDealImageUrl","topDealButtonLabel"],
    "stamps":["label","headline","slogan"],
    "content":["menuLabel","menuHeadline","menuDescription","aboutLabel","aboutHeadline","aboutText","quoteText","quoteAttribution","contactLabel","contactHeadline","appHeadline","appText","footerText"],
    "seo":["title","description","ogImageUrl"]
  }'::jsonb;
$function$
;

CREATE OR REPLACE FUNCTION private.microsite_public_text_v1(value jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when jsonb_typeof(value)='string' then left(btrim(value#>>'{}', chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)),12000) else '' end;
$function$
;

CREATE OR REPLACE FUNCTION private.microsite_public_url_v1(value jsonb, kind text DEFAULT 'link'::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare candidate text := private.microsite_public_text_v1(value);
  authority text; host text; port text; query text; item text; key text;
begin
  if candidate='' or candidate ~ '[[:cntrl:][:space:]]' or position(chr(92) in candidate)>0 then return ''; end if;
  if kind='asset' then
    query := split_part(candidate,'#',1);
    query := case when position('?' in query)>0 then substring(query from position('?' in query)+1) else '' end;
    foreach item in array string_to_array(query,'&') loop
      key := private.microsite_public_query_key_v1(split_part(item,'=',1));
      if key ~* 'token|signature|credential|authorization|api[-_]?key|secret|^sig$|^key$' then return ''; end if;
    end loop;
  end if;
  if candidate like '/%' then
    if candidate like '//%' or candidate ~* '^/(%2f|%5c)' then return ''; end if;
    if kind='asset' and candidate='/upload-image.jpg' then return ''; end if;
    return candidate;
  end if;
  if kind='link' and candidate ~ '^#[a-zA-Z0-9_-]+$' then return candidate; end if;
  if candidate !~* '^https?://' then return ''; end if;
  authority := split_part(split_part(split_part(regexp_replace(candidate,'^https?://','','i'),'/',1),'?',1),'#',1);
  -- Never return URL userinfo, control characters or ambiguous encoded hosts.
  if authority='' or position('@' in authority)>0 or position('%' in authority)>0 then return ''; end if;
  if authority ~ '^\[' then
    if authority !~ '^\[[0-9a-fA-F:.]+\](:[0-9]+)?$' then return ''; end if;
    host := split_part(substr(authority,2),']',1);
    perform host::inet;
    port := substring(authority from '\]:([0-9]+)$');
  else
    if authority !~ '^[a-zA-Z0-9.-]+(:[0-9]+)?$' then return ''; end if;
    host := split_part(authority,':',1);
    port := nullif(split_part(authority,':',2),'');
    if host ~ '^[0-9.]+$' then perform host::inet; end if;
  end if;
  if port is not null and (length(port)>5 or port::integer>65535) then return ''; end if;
  return candidate;
exception when invalid_text_representation or numeric_value_out_of_range then return '';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.project_flat_microsite_config_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare result jsonb:='{}'; key text; raw jsonb; item jsonb; items jsonb; projected jsonb; copy text;
begin
  if not (input ?| array['headline','tagline','brandName','heroImageUrl','aboutText','sections','navItems']) then return null; end if;
  foreach key in array array['brandName','headline','tagline','locationLine','orderLabel','mainDealTitle','mainDealSubtitle','welcomeDealTitle','welcomeDealSubtitle','stampDescription','stampCta','menuHeading','aboutTitle','aboutText','contactPhone','contactAddress'] loop
    if jsonb_typeof(input->key)='string' then result:=result||jsonb_build_object(key,private.microsite_public_text_v1(input->key)); end if;
  end loop;
  foreach key in array array['heroImageUrl','logoImageUrl','qrImageUrl'] loop
    if jsonb_typeof(input->key)='string' then result:=result||jsonb_build_object(key,private.microsite_public_url_v1(input->key,'asset'));end if;
  end loop;
  copy:=private.microsite_public_text_v1(input->'accent');
  if copy ~* '^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$' then result:=result||jsonb_build_object('accent',copy);end if;
  if input->>'logoMode'=any(array['generated','image']) then result:=result||jsonb_build_object('logoMode',input->>'logoMode');end if;
  foreach key in array array['cornerRadius','contentWidth','navLogoScale','earnedStamps'] loop
    if jsonb_typeof(input->key)='number' then result:=result||jsonb_build_object(key,input->key);end if;
  end loop;
  foreach key in array array['navItems','galleryImages'] loop
    if jsonb_typeof(input->key)='array' then
      items:='[]';
      for item in select * from jsonb_array_elements(input->key) loop
        if jsonb_typeof(item)<>'string' then continue;end if;
        copy:=case when key='galleryImages' then private.microsite_public_url_v1(item,'asset') else private.microsite_public_text_v1(item) end;
        if copy<>'' then items:=items||jsonb_build_array(copy);end if;
      end loop;
      result:=result||jsonb_build_object(key,items);
    end if;
  end loop;
  if jsonb_typeof(input->'sections')='array' then
    items:='[]';
    for item in select * from jsonb_array_elements(input->'sections') loop
      if jsonb_typeof(item->'id')='string' and jsonb_typeof(item->'visible')='boolean' then
        items:=items||jsonb_build_array(jsonb_build_object('id',private.microsite_public_text_v1(item->'id'),'visible',item->'visible'));
      end if;
    end loop;
    result:=result||jsonb_build_object('sections',items);
  end if;
  if jsonb_typeof(input->'serviceItems')='array' then
    items:='[]';
    for item in select * from jsonb_array_elements(input->'serviceItems') loop
      if jsonb_typeof(item)<>'object' then continue;end if;
      projected:='{}';
      foreach key in array array['id','title','detail','icon'] loop
        if jsonb_typeof(item->key)='string' then projected:=projected||jsonb_build_object(key,private.microsite_public_text_v1(item->key));end if;
      end loop;
      if jsonb_typeof(item->'customIconUrl')='string' then projected:=projected||jsonb_build_object('customIconUrl',private.microsite_public_url_v1(item->'customIconUrl','asset'));end if;
      items:=items||jsonb_build_array(projected);
    end loop;
    result:=result||jsonb_build_object('serviceItems',items);
  end if;
  return nullif(result,'{}'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.project_public_microsite_config_v1(value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare input jsonb := value; result jsonb := '{}'; group_name text; fields jsonb; field_name text;
  group_value jsonb; raw jsonb; element_text jsonb := '{}'; element_styles jsonb := '{}';
  key text; copy text; style jsonb; style_key text; ranges jsonb := '{"fontSize":[10,160],"maxWidth":[120,1200],"height":[44,160],"gap":[0,96],"xOffset":[-360,360],"marginTop":[-120,240],"marginBottom":[-120,240],"imageScale":[50,180],"iconSize":[12,96]}';
  items jsonb; item jsonb; index integer; number_value numeric; is_asset boolean; is_link boolean; visible boolean;
begin
  if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>1048576 then return null; end if;
  if input ? 'publicSnapshot' then
    input := input->'publicSnapshot';
    if jsonb_typeof(input) is distinct from 'object' or input->>'schema' is distinct from 'benefitsi.public-microsite' or input->'version' is distinct from '1'::jsonb then return null; end if;
    for group_name,fields in select * from jsonb_each(private.microsite_public_fields_v1()) loop
      for field_name in select jsonb_array_elements_text(fields) loop
        if jsonb_typeof(input#>array[group_name,field_name]) is distinct from 'string' then return null; end if;
      end loop;
    end loop;
    if jsonb_typeof(input#>'{navigation,links}') is distinct from 'array' or jsonb_typeof(input#>'{hero,services}') is distinct from 'array' or jsonb_typeof(input#>'{deals,topDealBullets}') is distinct from 'array' then return null; end if;
    -- Older v1 envelopes retained this choice only beside publicSnapshot.
    -- Recover this enum alone; any explicit snapshot value takes precedence.
    if not (input->'branding' ? 'paletteMode') then
      input:=jsonb_set(input,'{branding,paletteMode}',
        to_jsonb(case when value#>>'{branding,paletteMode}'='manual' then 'manual'::text else 'auto'::text end));
    end if;
  elsif not (input ? 'hero' or input ? 'template') then
    return private.project_flat_microsite_config_v1(input);
  end if;
  if private.microsite_public_text_v1(input->'template')='' or private.microsite_public_text_v1(input#>'{hero,headline}')='' then return null; end if;

  for key,raw in select * from jsonb_each(case when jsonb_typeof(input->'elementText')='object' then input->'elementText' else '{}'::jsonb end) loop
    if not private.microsite_public_element_v1(key) then continue; end if;
    copy := private.microsite_public_text_v1(raw);
    is_asset := key ~ '(Url|\.logo)$' or key='footer.benefitsiLogo';
    is_link := key ~ '\.url$' or key='content.contactMap';
    if key ~ '\.(enabled|showImage)$' then copy := case when copy='false' then 'false' else 'true' end;
    elsif is_asset or is_link then copy := private.microsite_public_url_v1(to_jsonb(copy),case when is_asset then 'asset' else 'link' end); end if;
    -- Preserve JSON null: group overrides use ?? whereas other text uses ||.
    element_text := element_text || jsonb_build_object(key,case when raw='null'::jsonb then 'null'::jsonb else to_jsonb(copy) end);
  end loop;
  for key,raw in select * from jsonb_each(case when jsonb_typeof(input->'elementStyles')='object' then input->'elementStyles' else '{}'::jsonb end) loop
    if not (key='navigation.group' or (private.microsite_public_element_v1(key) and key !~ '\.(enabled|showImage|url)$' and key<>'content.contactMap' and key not like 'seo.%' and key<>all(array['branding.accent','branding.accentSecondary','branding.accentTertiary','branding.logoUrl','content.menuFeaturedItemKey','content.socialFeed.platform']))) then continue; end if;
    style := '{}';
    copy := private.microsite_public_text_v1(raw->'color');
    if copy ~* '^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$' then style:=style||jsonb_build_object('color',copy); end if;
    foreach style_key in array array['bold','italic','underline'] loop
      if jsonb_typeof(raw->style_key)='boolean' then style:=style||jsonb_build_object(style_key,raw->style_key); end if;
    end loop;
    copy := private.microsite_public_text_v1(raw->'fontFamily');
    if copy=any(array['inherit','Arial','Georgia','Verdana','system-ui','serif','sans-serif']) then style:=style||jsonb_build_object('fontFamily',copy); end if;
    for style_key in select jsonb_object_keys(ranges) loop
      if jsonb_typeof(raw->style_key)='number' then
        number_value:=greatest((ranges->style_key->>0)::numeric,least((ranges->style_key->>1)::numeric,(raw->>style_key)::numeric));
        style:=style||jsonb_build_object(style_key,number_value);
      end if;
    end loop;
    if style<>'{}'::jsonb then element_styles:=element_styles||jsonb_build_object(key,style); end if;
  end loop;

  for group_name,fields in select * from jsonb_each(private.microsite_public_fields_v1()) loop
    group_value:='{}';
    for field_name in select jsonb_array_elements_text(fields) loop
      -- Preserve the public source fields. The TS contract applies overrides
      -- exactly once; eagerly merging them here would alter null/empty semantics.
      raw:=input#>array[group_name,field_name];
      copy:=private.microsite_public_text_v1(raw);
      if field_name like '%Url' then copy:=private.microsite_public_url_v1(to_jsonb(copy),'asset');
      elsif field_name like 'accent%' and copy !~* '^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$' then copy:=''; end if;
      group_value:=group_value||jsonb_build_object(field_name,copy);
    end loop;
    result:=result||jsonb_build_object(group_name,group_value);
  end loop;

  items:='[]';
  for item in select * from jsonb_array_elements(case when jsonb_typeof(input#>'{navigation,links}')='array' then input#>'{navigation,links}' else '[]'::jsonb end) loop
    copy:=private.microsite_public_text_v1(item->'anchor');
    if copy=any(array['deals','stempelkarte','speisekarte','ueber-uns','app','kontakt']) then
      items:=items||jsonb_build_array(jsonb_build_object('anchor',copy,'label',private.microsite_public_text_v1(item->'label')));
    end if;
  end loop;
  result:=result||jsonb_build_object('navigation',jsonb_build_object('links',items));
  items:='[]';index:=0;
  for item in select * from jsonb_array_elements(case when jsonb_typeof(input#>'{hero,services}')='array' then input#>'{hero,services}' else '[]'::jsonb end) limit 12 loop
    group_value:='{}';
    foreach field_name in array array['label','icon','description'] loop
      group_value:=group_value||jsonb_build_object(field_name,private.microsite_public_text_v1(item->field_name));
    end loop;
    items:=items||jsonb_build_array(group_value);index:=index+1;
  end loop;
  result:=jsonb_set(result,'{hero,services}',items);
  items:='[]';index:=0;
  for item in select * from jsonb_array_elements(case when jsonb_typeof(input#>'{deals,topDealBullets}')='array' then input#>'{deals,topDealBullets}' else '[]'::jsonb end) limit 20 loop
    items:=items||jsonb_build_array(private.microsite_public_text_v1(item));index:=index+1;
  end loop;
  result:=jsonb_set(result,'{deals,topDealBullets}',items);
  items:='[]';
  for item in select * from jsonb_array_elements(case when jsonb_typeof(input#>'{seo,keywords}')='array' then input#>'{seo,keywords}' else '[]'::jsonb end) limit 40 loop
    copy:=private.microsite_public_text_v1(item);if copy<>'' then items:=items||jsonb_build_array(copy);end if;
  end loop;
  result:=jsonb_set(result,'{seo,keywords}',items);
  result:=jsonb_set(result,'{seo,noIndex}',to_jsonb(coalesce(input#>'{seo,noIndex}'='true'::jsonb,false)));
  result:=result||jsonb_build_object('schema','benefitsi.public-microsite','version',1,'template',private.microsite_public_text_v1(input->'template'),
    'language',case when input->>'language'='en' then 'en' else 'de' end,
    'appearance',jsonb_build_object('mode',case when input#>>'{appearance,mode}'='dark' then 'dark' else 'light' end),
    'elementText',element_text,'elementStyles',element_styles);
  -- Optional in public snapshot v1: older publications have no paletteMode.
  -- Only the Builder's explicit manual value disables automatic brand colors.
  result:=jsonb_set(result,'{branding,paletteMode}',
    to_jsonb(case when input#>>'{branding,paletteMode}'='manual' then 'manual'::text else 'auto'::text end));
  return jsonb_build_object('publicSnapshot',result);
end;
$function$
;

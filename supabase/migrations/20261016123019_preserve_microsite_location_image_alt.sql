-- Exact authoritative production definition read on 2026-10-16.
-- Only content.aboutLocationImageAlt is added. CREATE OR REPLACE retains
-- ownership and existing ACL; volatility, invoker mode and search_path remain.
CREATE OR REPLACE FUNCTION private.microsite_public_element_v1(key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select key = any(array[
    'branding.partnerName','branding.logo','contact.logo','footer.benefitsiLogo',
    'content.aboutHeroImageUrl','content.aboutIngredientImageUrl','content.aboutLocationImageUrl','content.aboutLocationImageAlt','content.aboutPrepImageUrl',
    'content.aboutSlogan','content.aboutTextSecond','content.aboutThanks','content.aboutSignature',
    'content.contactSlogan','content.contactSocialText','content.contactMap','content.contactOpening',
    'content.appKicker','content.appPhoneScreenshotUrl','content.appQrLabel','content.appQrText',
    'content.ecosystemKicker','content.ecosystemHeadline','content.ecosystemText',
    'content.faqHeadline','content.faqLabel','content.faqText','content.menuFeaturedItemKey',
    'content.socialFeed.enabled','content.socialFeed.platform','content.socialFeedHeadline','content.socialFeedKicker','stamps.description',
    'navigation.deals','navigation.stempelkarte','navigation.speisekarte','navigation.ueber-uns','navigation.app','navigation.kontakt'
  ]) or key ~ '^(social\.(instagram|facebook|tiktok|youtube|whatsapp|website|google|linkedin)\.(enabled|iconUrl|label|url)|content\.socialFeed\.(instagram|tiktok)\.[0-5]\.url|content\.menuItem\.[a-z0-9_-]+\.(imageUrl|showImage)|content\.faq\.[0-5]\.(question|answer)|content\.aboutValue\.[0-3]|content\.appBenefit\.[0-2]|content\.contact\.(address|phone|opening)|hero\.services\.[0-9]+\.(label|icon|description)|deals\.topDealBullets\.[0-9]+)$'
  or (array_length(string_to_array(key,'.'),1)=2 and coalesce((private.microsite_public_fields_v1()->split_part(key,'.',1)) ? split_part(key,'.',2),false));
$function$;

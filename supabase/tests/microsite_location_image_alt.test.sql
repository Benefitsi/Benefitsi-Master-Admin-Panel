-- Run after the migration against the actual private projector and its helpers.
-- Requires the reviewed existing production definitions/ACL in the test database.
-- Payload is the prepared 15-field BABA media repair, used as a JSON literal only:
-- no partners, versions, configs, Storage objects or publication pointers are written.
-- Stop on the first error (psql -v ON_ERROR_STOP=1). An unapplied migration MUST fail.
begin;
do $test$
declare
  fixture jsonb := $fixture${
  "seo": {
    "title": "BABA DÖNER in Annweiler | Kontakt & Benefitsi-Vorteile",
    "noIndex": true,
    "keywords": [
      "BABA DÖNER",
      "Annweiler am Trifels",
      "Benefitsi",
      "Vorteile",
      "Stempelkarte",
      "Speisekarte"
    ],
    "ogImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-0-images-ai-upscaled-2476x1980-1800x1800-1800x1800.webp",
    "description": "BABA DÖNER in Annweiler am Trifels: Standort, Kontaktmöglichkeiten und Informationen zum Betrieb."
  },
  "hero": {
    "slogan": "Türkische Spezialitäten in der Landauer Straße.",
    "headline": "BABA DÖNER",
    "services": [
      {
        "icon": "bag",
        "label": "Abholung",
        "description": "Angebot laut regionalem Tourismusportal."
      },
      {
        "icon": "phone",
        "label": "Direkter Kontakt",
        "description": "06346 3088447"
      }
    ],
    "badgeText": "Offizieller Benefitsi Partner",
    "openingText": "Öffnungszeiten und Kontakt unten auf dieser Seite.",
    "locationText": "Annweiler am Trifels",
    "backgroundImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-0-images-ai-upscaled-2476x1980-1800x1800-1800x1800.webp",
    "primaryButtonLabel": "Vorteile ansehen",
    "secondaryButtonLabel": "Speisekarte ansehen"
  },
  "deals": {
    "label": "Vorteile & Aktionen",
    "slogan": "Mehr genießen, mehr sparen!",
    "headline": "Deine veröffentlichten Vorteile",
    "description": "Hier findest du die aktuell freigegebenen Benefitsi-Angebote. Es gelten jeweils die angezeigten Bedingungen.",
    "topDealLabel": "Vorteil",
    "topDealBullets": [
      "Bedingungen des jeweiligen Vorteils lesen",
      "Verfügbarkeit in der Benefitsi-App prüfen"
    ],
    "illustrationUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/feature-1791137013250-babadoner-doner-1440x940-1440x940.webp",
    "topDealHeadline": "Aktuelle Benefitsi-Angebote",
    "topDealImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/feature-1791137013250-babadoner-doner-1440x940-1440x940.webp",
    "topDealButtonLabel": "Vorteil in der App aktivieren",
    "topDealDescription": "Wähle den passenden Vorteil aus der Liste."
  },
  "assets": {
    "library": [
      {
        "id": "partner-logo",
        "url": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/ai-upscaled/6d29083bc1f4-logo-1784274939005-a.ai-upscaled-960x960.webp",
        "slot": "branding.logo",
        "label": "Partnerlogo",
        "source": "partner"
      },
      {
        "id": "partner-feature",
        "url": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/feature-1791137013250-babadoner-doner-1440x940-1440x940.webp",
        "slot": "partner.feature",
        "label": "Feature-Bild",
        "source": "partner"
      },
      {
        "id": "cover-1",
        "url": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-0-images-ai-upscaled-2476x1980-1800x1800-1800x1800.webp",
        "slot": "partner.cover",
        "label": "Cover 1",
        "source": "partner"
      },
      {
        "id": "cover-2",
        "url": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-1-doner-kebab-033-576x1024-ai-upscaled-2250x4000-1800x1800-1800x1800.webp",
        "slot": "partner.cover",
        "label": "Cover 2",
        "source": "partner"
      },
      {
        "id": "cover-3",
        "url": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/discover-1791136966704-images-8-880x960-880x960.webp",
        "slot": "partner.cover",
        "label": "Cover 3",
        "source": "partner"
      }
    ]
  },
  "stamps": {
    "label": "Stempelkarte",
    "slogan": "Es gelten die Bedingungen der veröffentlichten Stempelangebote.",
    "headline": "Stempel sammeln. Belohnung genießen."
  },
  "builder": {
    "lastQaAt": "",
    "versionNote": "Scoped authorized media repair 2026-10-16 via coordinating chat 01a1441c-a96d-71a0-9828-bf067702a23c. Four missing Storage references replaced only with existing BABA-assigned media; food-image alt corrected. Original history retained. No other copy, partner data, permissions, entitlements, or indexation changed. Codex automated publication.",
    "mobileQaDone": false,
    "desktopQaDone": false,
    "seoReviewDone": false,
    "assetReviewDone": false,
    "mockDealsPreview": false,
    "publishReviewDone": false,
    "partnerDataReviewDone": false
  },
  "content": {
    "appText": "Sieh dir die veröffentlichten Vorteile und ihre Bedingungen an. Die Einlösung erfolgt über die Benefitsi-App.",
    "aboutText": "BABA DÖNER liegt in der Landauer Straße 46 in Annweiler am Trifels. Das regionale Tourismusportal führt den Betrieb als Imbiss mit türkischen Spezialitäten und Abholservice. Fragen zu Gerichten, Abholung oder besonderen Wünschen klärst du am besten direkt telefonisch.",
    "menuLabel": "Speisekarte",
    "quoteText": "",
    "aboutLabel": "Über uns",
    "footerText": "Lokale Adressen und veröffentlichte Vorteile mit Benefitsi entdecken.",
    "appHeadline": "Alle lokalen Vorteile in deiner Benefitsi App",
    "contactLabel": "Kontakt",
    "menuHeadline": "Speisekarte auf einen Blick",
    "aboutHeadline": "BABA DÖNER auf einen Blick",
    "contactHeadline": "Bereit für deinen nächsten Besuch?",
    "menuDescription": "Die hinterlegte Auswahl hilft dir bei der Orientierung. Aktuelle Preise und Verfügbarkeit bitte vor der Bestellung beim Betrieb prüfen.",
    "quoteAttribution": ""
  },
  "branding": {
    "accent": "#118cff",
    "logoUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/logo-1784274939005-a.png",
    "paletteMode": "auto",
    "accentTertiary": "#17d4d7",
    "accentSecondary": "#061829",
    "partnerBadgeUrl": ""
  },
  "language": "de",
  "template": "restaurant-premium",
  "appearance": {
    "mode": "light"
  },
  "navigation": {
    "links": [
      {
        "label": "Vorteile",
        "anchor": "deals"
      },
      {
        "label": "Stempelkarte",
        "anchor": "stempelkarte"
      },
      {
        "label": "Speisekarte",
        "anchor": "speisekarte"
      },
      {
        "label": "Über Uns",
        "anchor": "ueber-uns"
      },
      {
        "label": "Benefitsi-App",
        "anchor": "app"
      },
      {
        "label": "Kontakt",
        "anchor": "kontakt"
      }
    ]
  },
  "printables": {
    "cta": "Jetzt in der Benefitsi App entdecken",
    "note": "BABA DÖNER in 76855 Annweiler am Trifels",
    "headline": "BABA DÖNER x Benefitsi",
    "subheadline": "Döner",
    "activeFormat": "flyer-a5",
    "activeTemplate": "bold-offer"
  },
  "elementText": {
    "social.google.url": "https://www.pfalz.de/de/gastronomie/baba-doener",
    "social.google.label": "Eintrag im Pfalz-Tourismusportal",
    "social.website.enabled": "false",
    "content.contact.opening": "Laut Pfalz-Tourismusportal, geprüft am 20.09.2026:\nDienstag–Freitag 11:00–22:00 Uhr · Samstag–Sonntag 12:00–22:00 Uhr.\nMontag Ruhetag. Vor dem Besuch bitte telefonisch bestätigen.",
    "content.contactSocialText": "Quellen und Kontaktmöglichkeiten",
    "content.socialFeed.enabled": "false",
    "content.aboutLocationImageAlt": "Speisenmotiv im BABA-Partnerprofil"
  },
  "elementStyles": {},
  "publicSnapshot": {
    "seo": {
      "title": "BABA DÖNER in Annweiler | Kontakt & Benefitsi-Vorteile",
      "noIndex": true,
      "keywords": [
        "BABA DÖNER",
        "Annweiler am Trifels",
        "Benefitsi",
        "Vorteile",
        "Stempelkarte",
        "Speisekarte"
      ],
      "ogImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-0-images-ai-upscaled-2476x1980-1800x1800-1800x1800.webp",
      "description": "BABA DÖNER in Annweiler am Trifels: Standort, Kontaktmöglichkeiten und Informationen zum Betrieb."
    },
    "hero": {
      "slogan": "Türkische Spezialitäten in der Landauer Straße.",
      "headline": "BABA DÖNER",
      "services": [
        {
          "icon": "bag",
          "label": "Abholung",
          "description": "Angebot laut regionalem Tourismusportal."
        },
        {
          "icon": "phone",
          "label": "Direkter Kontakt",
          "description": "06346 3088447"
        }
      ],
      "badgeText": "Offizieller Benefitsi Partner",
      "openingText": "Öffnungszeiten und Kontakt unten auf dieser Seite.",
      "locationText": "Annweiler am Trifels",
      "backgroundImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-0-images-ai-upscaled-2476x1980-1800x1800-1800x1800.webp",
      "primaryButtonLabel": "Vorteile ansehen",
      "secondaryButtonLabel": "Speisekarte ansehen"
    },
    "deals": {
      "label": "Vorteile & Aktionen",
      "slogan": "Mehr genießen, mehr sparen!",
      "headline": "Deine veröffentlichten Vorteile",
      "description": "Hier findest du die aktuell freigegebenen Benefitsi-Angebote. Es gelten jeweils die angezeigten Bedingungen.",
      "topDealLabel": "Vorteil",
      "topDealBullets": [
        "Bedingungen des jeweiligen Vorteils lesen",
        "Verfügbarkeit in der Benefitsi-App prüfen"
      ],
      "illustrationUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/feature-1791137013250-babadoner-doner-1440x940-1440x940.webp",
      "topDealHeadline": "Aktuelle Benefitsi-Angebote",
      "topDealImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/feature-1791137013250-babadoner-doner-1440x940-1440x940.webp",
      "topDealButtonLabel": "Vorteil in der App aktivieren",
      "topDealDescription": "Wähle den passenden Vorteil aus der Liste."
    },
    "schema": "benefitsi.public-microsite",
    "stamps": {
      "label": "Stempelkarte",
      "slogan": "Es gelten die Bedingungen der veröffentlichten Stempelangebote.",
      "headline": "Stempel sammeln. Belohnung genießen."
    },
    "content": {
      "appText": "Sieh dir die veröffentlichten Vorteile und ihre Bedingungen an. Die Einlösung erfolgt über die Benefitsi-App.",
      "aboutText": "BABA DÖNER liegt in der Landauer Straße 46 in Annweiler am Trifels. Das regionale Tourismusportal führt den Betrieb als Imbiss mit türkischen Spezialitäten und Abholservice. Fragen zu Gerichten, Abholung oder besonderen Wünschen klärst du am besten direkt telefonisch.",
      "menuLabel": "Speisekarte",
      "quoteText": "",
      "aboutLabel": "Über uns",
      "footerText": "Lokale Adressen und veröffentlichte Vorteile mit Benefitsi entdecken.",
      "appHeadline": "Alle lokalen Vorteile in deiner Benefitsi App",
      "contactLabel": "Kontakt",
      "menuHeadline": "Speisekarte auf einen Blick",
      "aboutHeadline": "BABA DÖNER auf einen Blick",
      "contactHeadline": "Bereit für deinen nächsten Besuch?",
      "menuDescription": "Die hinterlegte Auswahl hilft dir bei der Orientierung. Aktuelle Preise und Verfügbarkeit bitte vor der Bestellung beim Betrieb prüfen.",
      "quoteAttribution": ""
    },
    "version": 1,
    "branding": {
      "accent": "#118cff",
      "logoUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/logo-1784274939005-a.png",
      "accentTertiary": "#17d4d7",
      "accentSecondary": "#061829",
      "partnerBadgeUrl": ""
    },
    "language": "de",
    "template": "restaurant-premium",
    "appearance": {
      "mode": "light"
    },
    "navigation": {
      "links": [
        {
          "label": "Vorteile",
          "anchor": "deals"
        },
        {
          "label": "Stempelkarte",
          "anchor": "stempelkarte"
        },
        {
          "label": "Speisekarte",
          "anchor": "speisekarte"
        },
        {
          "label": "Über Uns",
          "anchor": "ueber-uns"
        },
        {
          "label": "Benefitsi-App",
          "anchor": "app"
        },
        {
          "label": "Kontakt",
          "anchor": "kontakt"
        }
      ]
    },
    "elementText": {
      "social.google.url": "https://www.pfalz.de/de/gastronomie/baba-doener",
      "social.google.label": "Eintrag im Pfalz-Tourismusportal",
      "social.website.enabled": "false",
      "content.contact.opening": "Laut Pfalz-Tourismusportal, geprüft am 20.09.2026:\nDienstag–Freitag 11:00–22:00 Uhr · Samstag–Sonntag 12:00–22:00 Uhr.\nMontag Ruhetag. Vor dem Besuch bitte telefonisch bestätigen.",
      "content.contactSocialText": "Quellen und Kontaktmöglichkeiten",
      "content.socialFeed.enabled": "false",
      "content.aboutLocationImageAlt": "Speisenmotiv im BABA-Partnerprofil"
    },
    "elementStyles": {}
  }
}$fixture$::jsonb;
  expected_before jsonb := $expected${
  "publicSnapshot": {
    "seo": {
      "title": "BABA DÖNER in Annweiler | Kontakt & Benefitsi-Vorteile",
      "noIndex": true,
      "keywords": [
        "BABA DÖNER",
        "Annweiler am Trifels",
        "Benefitsi",
        "Vorteile",
        "Stempelkarte",
        "Speisekarte"
      ],
      "ogImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-0-images-ai-upscaled-2476x1980-1800x1800-1800x1800.webp",
      "description": "BABA DÖNER in Annweiler am Trifels: Standort, Kontaktmöglichkeiten und Informationen zum Betrieb."
    },
    "hero": {
      "slogan": "Türkische Spezialitäten in der Landauer Straße.",
      "headline": "BABA DÖNER",
      "services": [
        {
          "icon": "bag",
          "label": "Abholung",
          "description": "Angebot laut regionalem Tourismusportal."
        },
        {
          "icon": "phone",
          "label": "Direkter Kontakt",
          "description": "06346 3088447"
        }
      ],
      "badgeText": "Offizieller Benefitsi Partner",
      "openingText": "Öffnungszeiten und Kontakt unten auf dieser Seite.",
      "locationText": "Annweiler am Trifels",
      "backgroundImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/covers/baba-doener-annweiler-1791210691301-0-images-ai-upscaled-2476x1980-1800x1800-1800x1800.webp",
      "primaryButtonLabel": "Vorteile ansehen",
      "secondaryButtonLabel": "Speisekarte ansehen"
    },
    "deals": {
      "label": "Vorteile & Aktionen",
      "slogan": "Mehr genießen, mehr sparen!",
      "headline": "Deine veröffentlichten Vorteile",
      "description": "Hier findest du die aktuell freigegebenen Benefitsi-Angebote. Es gelten jeweils die angezeigten Bedingungen.",
      "topDealLabel": "Vorteil",
      "topDealBullets": [
        "Bedingungen des jeweiligen Vorteils lesen",
        "Verfügbarkeit in der Benefitsi-App prüfen"
      ],
      "illustrationUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/feature-1791137013250-babadoner-doner-1440x940-1440x940.webp",
      "topDealHeadline": "Aktuelle Benefitsi-Angebote",
      "topDealImageUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/feature-1791137013250-babadoner-doner-1440x940-1440x940.webp",
      "topDealButtonLabel": "Vorteil in der App aktivieren",
      "topDealDescription": "Wähle den passenden Vorteil aus der Liste."
    },
    "schema": "benefitsi.public-microsite",
    "stamps": {
      "label": "Stempelkarte",
      "slogan": "Es gelten die Bedingungen der veröffentlichten Stempelangebote.",
      "headline": "Stempel sammeln. Belohnung genießen."
    },
    "content": {
      "appText": "Sieh dir die veröffentlichten Vorteile und ihre Bedingungen an. Die Einlösung erfolgt über die Benefitsi-App.",
      "aboutText": "BABA DÖNER liegt in der Landauer Straße 46 in Annweiler am Trifels. Das regionale Tourismusportal führt den Betrieb als Imbiss mit türkischen Spezialitäten und Abholservice. Fragen zu Gerichten, Abholung oder besonderen Wünschen klärst du am besten direkt telefonisch.",
      "menuLabel": "Speisekarte",
      "quoteText": "",
      "aboutLabel": "Über uns",
      "footerText": "Lokale Adressen und veröffentlichte Vorteile mit Benefitsi entdecken.",
      "appHeadline": "Alle lokalen Vorteile in deiner Benefitsi App",
      "contactLabel": "Kontakt",
      "menuHeadline": "Speisekarte auf einen Blick",
      "aboutHeadline": "BABA DÖNER auf einen Blick",
      "contactHeadline": "Bereit für deinen nächsten Besuch?",
      "menuDescription": "Die hinterlegte Auswahl hilft dir bei der Orientierung. Aktuelle Preise und Verfügbarkeit bitte vor der Bestellung beim Betrieb prüfen.",
      "quoteAttribution": ""
    },
    "version": 1,
    "branding": {
      "accent": "#118cff",
      "logoUrl": "https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/22222222-2222-4222-8222-222222222222/logo-1784274939005-a.png",
      "paletteMode": "auto",
      "accentTertiary": "#17d4d7",
      "accentSecondary": "#061829",
      "partnerBadgeUrl": ""
    },
    "language": "de",
    "template": "restaurant-premium",
    "appearance": {
      "mode": "light"
    },
    "navigation": {
      "links": [
        {
          "label": "Vorteile",
          "anchor": "deals"
        },
        {
          "label": "Stempelkarte",
          "anchor": "stempelkarte"
        },
        {
          "label": "Speisekarte",
          "anchor": "speisekarte"
        },
        {
          "label": "Über Uns",
          "anchor": "ueber-uns"
        },
        {
          "label": "Benefitsi-App",
          "anchor": "app"
        },
        {
          "label": "Kontakt",
          "anchor": "kontakt"
        }
      ]
    },
    "elementText": {
      "social.google.url": "https://www.pfalz.de/de/gastronomie/baba-doener",
      "social.google.label": "Eintrag im Pfalz-Tourismusportal",
      "social.website.enabled": "false",
      "content.contact.opening": "Laut Pfalz-Tourismusportal, geprüft am 20.09.2026:\nDienstag–Freitag 11:00–22:00 Uhr · Samstag–Sonntag 12:00–22:00 Uhr.\nMontag Ruhetag. Vor dem Besuch bitte telefonisch bestätigen.",
      "content.contactSocialText": "Quellen und Kontaktmöglichkeiten",
      "content.socialFeed.enabled": "false"
    },
    "elementStyles": {}
  }
}$expected$::jsonb;
  source_before text := $source$CREATE OR REPLACE FUNCTION private.microsite_public_element_v1(key text)
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
$source$;
  projected jsonb;
  noisy jsonb;
  attributes record;
begin
  projected := private.project_public_microsite_config_v1(fixture);
  if projected #>> '{publicSnapshot,elementText,content.aboutLocationImageAlt}'
       is distinct from 'Speisenmotiv im BABA-Partnerprofil' then
    raise exception 'new location-image alt must survive the actual public projector';
  end if;
  if projected #- '{publicSnapshot,elementText,content.aboutLocationImageAlt}'
       is distinct from expected_before then
    raise exception 'existing BABA projection changed beyond the single approved alt key';
  end if;
  -- A neighboring spelling or arbitrary private value must not inherit the new grant.
  noisy := jsonb_set(fixture, '{publicSnapshot,elementText}',
    fixture #> '{publicSnapshot,elementText}' || jsonb_build_object(
      'content.aboutLocationImageAltPrivate', 'PRIVATE_SENTINEL',
      'content.aboutLocationImageAlt.extra', 'PRIVATE_SENTINEL',
      'private.ownerEmail', 'PRIVATE_SENTINEL',
      'builder.versionNote', 'PRIVATE_SENTINEL'));
  noisy := jsonb_set(noisy, '{publicSnapshot,elementStyles}',
    coalesce(fixture #> '{publicSnapshot,elementStyles}', '{}'::jsonb) ||
    '{"private.ownerEmail":{"color":"#ff0000"}}'::jsonb);
  if private.project_public_microsite_config_v1(noisy) is distinct from projected then
    raise exception 'unknown/private fields leaked into the public snapshot';
  end if;
  if private.microsite_public_element_v1('content.aboutLocationImageAltPrivate')
     or private.microsite_public_element_v1('content.aboutLocationImageAlt.extra')
     or private.microsite_public_element_v1('private.ownerEmail') then
    raise exception 'allowlist broadened beyond the exact approved key';
  end if;
  if not private.microsite_public_element_v1('content.aboutLocationImageUrl')
     or not private.microsite_public_element_v1('content.contactOpening') then
    raise exception 'existing allowed elements were lost';
  end if;
  -- Compare the full function definition after removing ONLY the added literal.
  if replace(pg_get_functiondef('private.microsite_public_element_v1(text)'::regprocedure),
      '''content.aboutLocationImageAlt'',', '') is distinct from source_before then
    raise exception 'other allowlist rules or function flags changed';
  end if;
  select p.provolatile,p.prosecdef,p.proisstrict,p.proparallel,p.proconfig,
         p.proacl::text as acl, pg_get_userbyid(p.proowner) as owner_name
    into attributes from pg_proc p
    where p.oid='private.microsite_public_element_v1(text)'::regprocedure;
  if attributes.provolatile <> 'i' or attributes.prosecdef or attributes.proisstrict
     or attributes.proparallel <> 'u'
     or attributes.proconfig is distinct from array['search_path=""']::text[]
     or attributes.acl is distinct from '{postgres=X/postgres}'
     or attributes.owner_name <> 'postgres' then
    raise exception 'function security attributes or ACL differ from the reviewed baseline';
  end if;
  raise notice 'PASS: actual BABA projection gains only exact alt key; private keys and function flags/ACL preserved';
end;
$test$;
rollback;

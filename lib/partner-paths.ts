const PARTNER_SLUG_ALIASES: Readonly<Record<string, string>> = {
  "kebap-haus-annweiler": "knobi-doener-und-pizza-haus",
  "knobi-doener-annweiler": "knobi-doener-und-pizza-haus",
  "knobi-imbiss-doener-kebab-annweiler": "knobi-doener-und-pizza-haus",
}

export function canonicalPartnerSlug(slug: string) {
  return PARTNER_SLUG_ALIASES[slug] ?? slug
}


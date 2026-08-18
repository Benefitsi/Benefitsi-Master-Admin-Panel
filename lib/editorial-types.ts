export type EditorialScope = "global" | "city" | "partner"
export type EditorialAudience = "benefitsi" | "partner"
export type EditorialStatus =
  | "draft"
  | "needs_review"
  | "active"
  | "archived"

export type EditorialSection = {
  heading: string
  paragraphs: string[]
}

export type EditorialSource = {
  label: string
  url: string
}

export type EditorialLink = {
  label: string
  href: string
}

export type EditorialPost = {
  id: string
  scope: EditorialScope
  city_id: string | null
  partner_id: string | null
  slug: string
  title: string
  excerpt: string
  eyebrow: string
  category: string
  audience: EditorialAudience
  content: EditorialSection[]
  sources: EditorialSource[]
  related_links: EditorialLink[]
  image_url: string | null
  image_alt: string | null
  status: EditorialStatus
  published_at: string | null
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

export type EditorialTarget = {
  id: string
  slug: string
  name: string
}

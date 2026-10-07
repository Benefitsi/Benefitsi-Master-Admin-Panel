// These records deliberately stay outside Partner/PartnerWithDeals and public DTOs.
export type InternalContact = { partner_id: string; email: string | null; mobile: string | null; updated_at: string | null }
export type PartnerBadge = {
  id: string; partner_id: string; updated_at: string; title: string; short_title: string | null;
  description: string | null; criteria: string | null; requirement_type: string; target_count: number;
  icon_key: string; accent_key: string; sort_order: number; active: boolean; configured_active?: boolean; rarity: string;
  layer_count: number; one_time: boolean; available_from: string | null; available_until: string | null; max_claims: number | null;
}
export type ConfigurationChange = {
  id: number; entity_type: string; entity_id: string; operation: string; created_at: string;
  before_value: Record<string, unknown> | null; after_value: Record<string, unknown> | null;
}
export type ConfigurationResult<T> = { ok: boolean; message: string; data?: T }
export const editableBadgeFields = ["title", "short_title", "description", "criteria", "icon_key", "accent_key", "sort_order", "active", "rarity", "layer_count"] as const

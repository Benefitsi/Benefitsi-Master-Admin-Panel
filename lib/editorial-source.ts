import { publicMicrositeUrl } from "@/lib/public-microsite-contract"

export function isPublishableEditorialSource(source: { label: string; url?: string }) {
  return source.label.trim().length > 0 && source.label.trim().length <= 200 && /^(https?:\/\/|\/(?!\/))/.test(publicMicrositeUrl(source.url))
}

export function normalizeEntityText(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").trim().replace(/\s+/g, " ")
    : ""
}

export function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalizeEntityText(left).split(" ").filter(Boolean))
  const b = new Set(normalizeEntityText(right).split(" ").filter(Boolean))
  if (!a.size || !b.size) return 0
  const intersection = [...a].filter((token) => b.has(token)).length
  return intersection / new Set([...a, ...b]).size
}

export function geoDistanceMeters(left: { lat: number; lng: number }, right: { lat: number; lng: number }) {
  const radius = 6_371_000
  const lat1 = (left.lat * Math.PI) / 180
  const lat2 = (right.lat * Math.PI) / 180
  const dLat = ((right.lat - left.lat) * Math.PI) / 180
  const dLng = ((right.lng - left.lng) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isLikelyDuplicate(input: {
  name: string
  address?: string
  coordinates?: { lat: number; lng: number }
  candidate: { name: string; address?: string; coordinates?: { lat: number; lng: number } }
}) {
  const nameScore = tokenSimilarity(input.name, input.candidate.name)
  const addressScore = input.address && input.candidate.address ? tokenSimilarity(input.address, input.candidate.address) : 0
  const nearby = input.coordinates && input.candidate.coordinates
    ? geoDistanceMeters(input.coordinates, input.candidate.coordinates) <= 75
    : false
  return nameScore >= 0.75 || (nameScore >= 0.45 && (addressScore >= 0.6 || nearby))
}

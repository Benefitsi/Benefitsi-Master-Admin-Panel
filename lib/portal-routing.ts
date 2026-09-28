export const ADMIN_ORIGIN = 'https://admin.benefitsi.de'
export const PARTNER_ORIGIN = 'https://partner.benefitsi.de'

export function isPartnerHost(host: string) {
  return host.toLowerCase().split(':')[0] === 'partner.benefitsi.de'
}

const publicPaths = new Set([
  '/login', '/partner/login', '/forgot-password', '/partner/forgot-password',
  '/reset-password', '/auth/confirm', '/auth/auth-code-error', '/robots.txt', '/sitemap.xml',
  '/ai-sw.js', '/favicon.ico', '/benefitsi-logo-on-light.svg', '/benefitsi-logo-on-dark.svg',
  '/Benefitsi_Icon_FullColor_RGB_512.png', '/benefitsi-app-qr-placeholder.png',
  '/benefitsi-location-pin.png', '/partner-details-page.jpg', '/upload-image.jpg',
  '/window.svg', '/globe.svg', '/next.svg', '/vercel.svg', '/file.svg',
])
// These endpoints authenticate their own service secret or Stripe signature.
// New endpoints are admin-only until explicitly reviewed here.
const machinePaths = new Set([
  '/api/automation/tick', '/api/automation/worker',
  '/api/internal/knowledge/sync/start', '/api/internal/knowledge/sync/batch',
  '/api/internal/knowledge/sync/complete', '/api/internal/knowledge/sync/fail',
  '/api/stripe/checkout', '/api/stripe/webhook', '/api/stripe/billing/webhook',
  '/api/commerce/bookings', '/api/commerce/catalog', '/api/commerce/account',
  '/api/commerce/notifications', '/api/commerce/status',
])
export type PortalRoute = {kind:'public'|'partner'|'admin'|'machine'|'deny'} | {kind:'redirect';url:string}

export function portalRoute(host: string, path: string, method: string): PortalRoute {
  // Encoded separators and dot segments must not change the policy after routing.
  if (/%(?:2f|5c|2e|25)/i.test(path) || path.includes('\\') || path.split('/').includes('..')) return {kind:'deny'}
  const partnerPath = path === '/partner' || path.startsWith('/partner/')
  const partnerHost = isPartnerHost(host)
  const read = method === 'GET' || method === 'HEAD'
  if (partnerHost && ['/', '/login', '/forgot-password'].includes(path)) {
    if (!read) return {kind:'deny'}
    const target = path === '/' ? '/partner' : `/partner${path}`
    return {kind:'redirect',url:PARTNER_ORIGIN+target}
  }
  if (host.toLowerCase().split(':')[0] === 'admin.benefitsi.de' && partnerPath) {
    return read ? {kind:'redirect',url:PARTNER_ORIGIN+path} : {kind:'deny'}
  }
  if (publicPaths.has(path)) return {kind:'public'}
  if (partnerPath) return {kind:'partner'}
  if (path === '/api/commerce/connect' || path === '/api/commerce/subscription') {
    return {kind:partnerHost ? 'partner' : 'admin'}
  }
  if (partnerHost) return {kind:'deny'}
  if (machinePaths.has(path)) return {kind:'machine'}
  if (path === '/p' || path.startsWith('/p/')) return {kind:'public'}
  return {kind:'admin'}
}

export function sessionCookieOptions(host: string) {
  const hostname = host.toLowerCase().split(':')[0]
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  return {
    name: local ? 'benefitsi-local-auth' : isPartnerHost(host) ? '__Host-benefitsi-partner-auth' : '__Host-benefitsi-admin-auth',
    path: '/', secure: !local, sameSite: 'lax' as const,
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { actorId, partnerId, rights, feature } from './helpers/partner-tasks-fixtures.mjs'

test('Free team-admin confirmation route renders only promised-task confirmation while ordinary management remains gated', async () => {
  const scopes = []
  const { default: Page } = feature('app/partner/tasks/confirm/page.tsx', {
    '@/lib/partners/page-context': { partnerPageContext: async id => { scopes.push(id); return { partnerId, rights: rights('admin', false), session: { user: { id: actorId } }, name: 'Shop', partners: [] } } },
    '@/components/partner/partner-dashboard': { PartnerDashboard: ({ children }) => h('main', null, children) },
    '@/components/partner/partner-task-settings-loader': { PartnerTaskSettingsLoader: props => h('div', { 'data-confirmation-only': props.confirmationOnly, 'data-partner': props.partnerId }) },
  })
  const html = render(await Page({ searchParams: Promise.resolve({ partner: partnerId }) }))
  assert.deepEqual(scopes, [partnerId])
  assert.match(html, /data-confirmation-only="true"/)
  assert.match(html, /data-partner="11111111/)
  assert.doesNotMatch(html, /Angebot erstellen|Profil bearbeiten|Feedback belohnen/)
})

test('scanner confirmation route renders denial without any token form/loader', async () => {
  let loads = 0
  const { default: Page } = feature('app/partner/tasks/confirm/page.tsx', {
    '@/lib/partners/page-context': { partnerPageContext: async () => ({ partnerId, rights: rights('scanner', false), name: 'Shop', partners: [], session: { user: { id: actorId } } }) },
    '@/components/partner/partner-dashboard': { PartnerDashboard: ({ children }) => h('main', null, children) },
    '@/components/partner/partner-task-settings-loader': { PartnerTaskSettingsLoader: () => { loads++; return h('form') } },
  })
  const html = render(await Page({ searchParams: Promise.resolve({}) }))
  assert.equal(loads, 0)
  assert.match(html, /Verwaltungsrecht/)
})

test('actual legacy Benefits workspace renders tasks adjacent to feedback without dropping offers or stamps', () => {
  const unused = () => null
  const media = { subscribeMediaMeasurements: () => () => {}, getMediaMeasurementRevision: () => 0, getServerMediaMeasurementRevision: () => 0, inspectPartnerMediaQuality: () => ({}) }
  const TaskLoader = feature('components/partner/partner-task-settings-loader.tsx', {
    '@/components/partner/partner-task-settings': feature('components/partner/partner-task-settings.tsx', { '@/app/partner/task-actions': {} }),
    '@/lib/supabase/client': { createClient: () => { throw new Error('SSR must not fetch client data') } },
  }).PartnerTaskSettingsLoader
  const FeedbackLoader = feature('components/partner/partner-feedback-settings-loader.tsx', {
    '@/components/partner/partner-feedback-settings': { PartnerFeedbackSettings: unused },
    '@/lib/supabase/client': { createClient: unused },
  }).PartnerFeedbackSettingsLoader
  const { PartnerWorkspace } = feature('app/partner-admin.tsx', {
    './use-partner-capabilities': { usePartnerCapabilities: partner => ({ partner }) },
    './streak-rule-fields': { StreakRuleFields: unused },
    './partner-actions': {}, './partner-enrichment-actions': {}, './microsite-panel': { MicrositePanel: unused },
    './admin-language': { useAdminLanguage: () => ({ language: 'de', t: value => value }) },
    '@/components/microsite-read-only-notice': { MicrositeReadOnlyNotice: unused },
    '@/components/loading-ui': { LoadingSpinner: unused },
    '@/components/menu-ai-import-dialog': { MenuAiImportDialog: unused },
    '@/components/partner/partner-plan-panel': { PartnerPlanPanel: unused },
    '@/components/partner/partner-feedback-settings-loader': { PartnerFeedbackSettingsLoader: FeedbackLoader },
    '@/components/partner/partner-task-settings-loader': { PartnerTaskSettingsLoader: TaskLoader },
    '@/lib/partner-media-quality': media,
    '@/lib/partner-visit-levels': { visitLevelsHref: () => '/partners/visit-levels' },
    '@/lib/partner-image-upscaler': {},
    'next/navigation': { useRouter: () => ({ refresh: () => {} }) },
    'next/link': ({ children, href }) => h('a', { href }, children),
  })
  const partner = { id: partnerId, name: 'Shop', type: 'shop', is_active: true, deals: [], holidays: [], socials: [], reward_milestones: [], staff: [], opening_hours: [], menus: [], stamp_progress: [], visits: [], fraud_events: [], microsite: null, stamp_target: 7 }
  const html = render(h(PartnerWorkspace, { partners: [partner], cities: [], owners: [], initialMode: 'view', initialPartnerId: partnerId, initialSettingsTab: 'deals', initialView: 'settings', portalMode: true, adminAccess: false, micrositeEditingEnabled: false }))
  assert.match(html, /<h2[^>]*>Vorteile<\/h2>/)
  assert.match(html, /Stempelprogramm|Stempelziel/)
  assert.match(html, /Feedback belohnen/)
  assert.match(html, /Aufgaben &amp; Belohnungen/)
  assert.ok(html.indexOf('Feedback belohnen') < html.indexOf('Aufgaben &amp; Belohnungen'))
})

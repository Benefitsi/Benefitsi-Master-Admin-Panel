/**
 * Curated product inventory, checked against Admin, App, Web and Database
 * sources on 2026-10-02, with partner CRM updated on 2026-10-03.
 * These descriptions are not runtime health checks,
 * contractual price quotes, or evidence of a public/App Store release.
 * Paths in `source` are relative to the named repository.
 */
import type { BenefitIconName } from '../benefit-icons'

export type EcosystemEntry = {
  id: string
  title: string
  description: string
  audience: string
  availability: string
  href: string
  source: string
} & (
  | { group: 'deals'; benefitIcon: BenefitIconName }
  | { group: 'app' | 'partner' | 'platform'; benefitIcon?: BenefitIconName }
)

export type TierCatalogEntry = {
  id: string
  audience: 'Nutzer' | 'Partner'
  name: string
  description: string
  features: string[]
  note: string
  href: string
}

export const tierCatalog: TierCatalogEntry[] = [
  {
    id: 'consumer-free',
    audience: 'Nutzer',
    name: 'Free',
    description: 'Kostenloser Nutzerzugang zum Entdecken und Stempelsammeln.',
    features: ['Digitale Stempelkarte', 'Happy Hour gemäß Zielgruppe', 'Partner und Stadtinhalte entdecken'],
    note: 'Die konkrete Berechtigung folgt dem jeweiligen Angebot. Persönliche Aktionen benötigen ein Konto; die öffentliche App-Freigabe ist gesondert zu prüfen.',
    href: 'https://benefitsi.de/premium',
  },
  {
    id: 'consumer-premium',
    audience: 'Nutzer',
    name: 'Premium',
    description: 'Zusätzliche Vorteile und Premium-Meilensteine für App-Nutzer.',
    features: ['Zusätzliche Stempelvorteile', 'Premium-Angebote und Deal Drops', 'Challenges, Streaks und anlassbezogene Vorteile'],
    note: 'Bezahlte Käufe sind im aktuellen App-Code deaktiviert. Der einmalige Testzugang umfasst 14 Tage und einen Premium-Vorteil. Premium ist kein Partner-Tarif.',
    href: 'https://benefitsi.de/premium',
  },
  {
    id: 'partner-free',
    audience: 'Partner',
    name: 'Free',
    description: 'Standardprofil innerhalb der Stadtseite mit Kontakt, Öffnungszeiten und Vorteilen.',
    features: ['Normale Angebote und Happy Hour ohne Mengenlimit', '1 Deal Drop je Kalendermonat und Standort', '3 Teammitglieder · 30 Tage Auswertung'],
    note: 'Keine eigene Microsite und keine erweiterten Medien. Besucherzielgruppen und Einlösebedingungen werden pro Angebot festgelegt.',
    href: 'https://benefitsi.de/partner-werden#tarife',
  },
  {
    id: 'partner-pro',
    audience: 'Partner',
    name: 'Pro',
    description: 'Erweiterter Partnerumfang mit eigener Microsite und vertiefter Auswertung.',
    features: ['Eigene Microsite und erweiterte Medien nach Freigabe', '10 Teammitglieder · 365 Tage Auswertung', 'Deal Drops vorläufig ohne Monatslimit', '2 KI-Menüimporte pro Abo-Monat, soweit freigegeben', 'Besuchsfeedback mit passendem Verwaltungsrecht', 'CRM-Entwürfe und redaktionelle Anfragen nach Freigabe'],
    note: 'Standard und Founder sind Preisangebote für Pro. Zusatzmodule benötigen eigene Verträge und Freigaben. Nachrichtenversand ist noch nicht verfügbar.',
    href: 'https://benefitsi.de/partner-werden#tarife',
  },
]

export const ecosystemCatalog: EcosystemEntry[] = [
  {
    id: 'app-account-access', title: 'Registrierung, Anmeldung und Gastzugang', group: 'app',
    description: 'Per E-Mail registrieren und mit einem E-Mail-Code anmelden. Apple- und Google-Anmeldung sind integriert; Gäste können öffentliche Inhalte entdecken.',
    audience: 'Neue Nutzer, bestehende Konten und Gäste', availability: 'Anmeldeanbieter benötigen passende Konfiguration',
    href: 'https://benefitsi.de/app', source: 'App: lib/pages/auth/register/register_widget.dart; lib/pages/auth/login_magic_link/login_magic_link_widget.dart; lib/auth/guest_auth.dart',
  },
  {
    id: 'app-profile-settings', title: 'Persönliches Profil und Einstellungen', group: 'app',
    description: 'Profil und Premium-Status ansehen, Namen und Stadt bearbeiten sowie den Geburtstag einmalig für passende Vorteile hinterlegen.',
    audience: 'Angemeldete Nutzer', availability: 'Persönliche Kontodaten · Geburtstag nach Festlegung gesperrt',
    href: 'https://benefitsi.de/app', source: 'App: lib/pages/app/user_profile/user_profile_widget.dart; lib/pages/app/settings/settings_widget.dart',
  },
  {
    id: 'app-language-onboarding', title: 'Sprache und Erste Schritte', group: 'app',
    description: 'Die App zwischen Deutsch und Englisch umstellen und die Einführung über „Erste Schritte“ erneut ansehen.',
    audience: 'Nutzer und Gäste', availability: 'App-Einstellungen',
    href: 'https://benefitsi.de/so-funktionierts', source: 'App: lib/components/language_selector/language_selector_widget.dart; lib/pages/app/settings/settings_widget.dart',
  },
  {
    id: 'app-privacy', title: 'Datenschutz und optionale Nutzungsanalyse', group: 'app',
    description: 'Die optionale Nutzungsanalyse ein- oder ausschalten sowie Datenschutzhinweise und AGB aus den Einstellungen öffnen.',
    audience: 'Nutzer und Gäste', availability: 'Einwilligung für optionale Analyse',
    href: 'https://benefitsi.de/datenschutz', source: 'App: lib/pages/app/settings/settings_widget.dart; lib/features/analytics/analytics_consent_ledger.dart',
  },
  {
    id: 'app-account-deletion', title: 'Abmelden und Konto löschen', group: 'app',
    description: 'Die Sitzung beenden oder nach ausdrücklicher Bestätigung die endgültige Kontolöschung mit Bereinigung lokaler Kontodaten auslösen.',
    audience: 'Angemeldete Nutzer', availability: 'Kontolöschung mit Bestätigung und Serverabgleich',
    href: 'https://benefitsi.de/konto-loeschen', source: 'App: lib/pages/app/settings/settings_widget.dart; lib/auth/account_deletion_coordinator.dart; lib/auth/account_local_data_cleanup.dart',
  },
  {
    id: 'app-help-support', title: 'Hilfe und Support', group: 'app',
    description: 'Hilfethemen lesen und eine Supportanfrage über das Kontaktformular stellen; bei Versandproblemen kann der E-Mail-Client geöffnet werden.',
    audience: 'Nutzer und Gäste', availability: 'Versanddienst oder eingerichteter E-Mail-Client',
    href: 'https://benefitsi.de/faq', source: 'App: lib/pages/app/docs/support/support_widget.dart; lib/features/support/contact_email_sender.dart',
  },
  {
    id: 'app-discovery', title: 'Entdecken in der App', group: 'app',
    description: 'Partner, Vorteile und Stadtinhalte über Kategorien und die ausgewählte Stadt finden.',
    audience: 'Nutzer und Gäste', availability: 'App-Funktion · Inhalte nach Stadtfreigabe',
    href: 'https://benefitsi.de/app', source: 'App: lib/features/discover/discovery_feed_resolver.dart',
  },
  {
    id: 'app-partner-favorites', title: 'Partnerfavoriten', group: 'app',
    description: 'Partner über das Herz im Partnerdetail merken oder entfernen und die eigenen Favoriten auf der Startseite wiederfinden.',
    audience: 'Angemeldete Nutzer', availability: 'Kontobezogene Favoriten',
    href: 'https://benefitsi.de/app', source: 'App: lib/pages/app/partner_details/partner_details_widget.dart; lib/home_page/widgets/home_dashboard_sections.dart',
  },
  {
    id: 'app-community-saved', title: 'Treffen, Merkliste und Community', group: 'app',
    description: 'Treffen merken, Teilnahme verwalten und eigene Treffen zur Prüfung vorschlagen. Unpassende Inhalte lassen sich melden und Veranstalter blockieren.',
    audience: 'Angemeldete Nutzer', availability: 'Stadtfreigabe, Teilnahmebedingungen und Moderation',
    href: 'https://benefitsi.de/stadt/annweiler/community/treffen', source: 'App: lib/features/discover/discovery_community_service.dart; lib/pages/app/discover/widgets/discovery_community_controls.dart',
  },
  {
    id: 'app-partner-map', title: 'Partnerkarte', group: 'app',
    description: 'Partnerstandorte auf einer Karte ansehen und über Marker zur passenden Partneransicht wechseln.',
    audience: 'Nutzer und Gäste', availability: 'App-Funktion · verfügbare Partnerstandorte',
    href: 'https://benefitsi.de/app', source: 'App: lib/components/partners_map/partners_map_widget.dart',
  },
  {
    id: 'app-partner-details', title: 'Partnerdetails und Öffnungszeiten', group: 'app',
    description: 'Kontakt, Öffnungszeiten, Vorteile und Stempelkarten eines Betriebs an einem Ort ansehen.',
    audience: 'Nutzer und Gäste', availability: 'App-Funktion · veröffentlichte Partnerdaten',
    href: '/#partners', source: 'App: lib/pages/app/partner_details/partner_details_widget.dart',
  },
  {
    id: 'app-menu', title: 'Speisekarten in der App', group: 'app',
    description: 'Das veröffentlichte Menü eines Partners mit seinen verfügbaren Kategorien und Artikeln öffnen.',
    audience: 'Nutzer und Gäste', availability: 'App-Funktion · Menü muss vorhanden sein',
    href: '/#partners', source: 'App: lib/features/menus/partner_menu_sheet.dart',
  },
  {
    id: 'app-qr', title: 'QR-Code und Einlösung', group: 'app',
    description: 'Einen ausgewählten Vorteil über den persönlichen QR-Code beim Partner prüfen und bestätigen lassen.',
    audience: 'Angemeldete Nutzer und Scanpersonal', availability: 'Angebots- und kontobezogene Berechtigung',
    href: 'https://benefitsi.de/so-funktionierts', source: 'App: lib/features/qr/qr_redemption_service.dart',
  },
  {
    id: 'app-offline-pin', title: 'Offline-PIN und nachträglicher Abgleich', group: 'app',
    description: 'Den vorgesehenen Offline-Ablauf für Einlösungen nutzen und ausstehende Vorgänge später mit dem Server abgleichen.',
    audience: 'Nutzer und Scanpersonal', availability: 'Einrichtung und Serverprüfung erforderlich',
    href: '/#partners', source: 'App: lib/features/qr/offline_pin_policy.dart; lib/features/qr/offline_redemption_sync_service.dart',
  },
  {
    id: 'app-stamp-card', title: 'Digitale Stempelkarte', group: 'app',
    description: 'Qualifizierte Besuche sammeln und den Fortschritt bis zu den eingerichteten Belohnungen verfolgen.',
    audience: 'Free und Premium', availability: 'Partnerprogramm und Meilenstein-Zielgruppe',
    href: '/#partners', source: 'App: lib/features/rewards/stamp_card_model.dart; lib/features/rewards/reward_service.dart',
  },
  {
    id: 'app-progress', title: 'Fortschritt und Besuchsverlauf', group: 'app',
    description: 'Eigene Stempelkarten, erreichte Vorteile und erfasste Besuche im persönlichen Fortschritt ansehen.',
    audience: 'Angemeldete Nutzer', availability: 'Persönliche Kontodaten',
    href: 'https://benefitsi.de/app', source: 'App: lib/pages/app/progress/progress_widget.dart; lib/features/visits/visit_repository.dart',
  },
  {
    id: 'app-city-pass', title: 'Stadtpass und Entdeckerstempel', group: 'app',
    description: 'Freigegebene Sammelorte entdecken und persönliche Erinnerungsstempel im Stadtpass sammeln.',
    audience: 'Angemeldete Nutzer', availability: 'Freigegebene Sammelorte · Standortnachweis',
    href: 'https://benefitsi.de/stadt/annweiler/memories', source: 'App: lib/pages/app/city_pass/city_pass_widget.dart; lib/features/memory_stamps/memory_stamp_service.dart',
  },
  {
    id: 'app-memory-sync', title: 'Entdeckerstempel offline vormerken', group: 'app',
    description: 'Ausstehende Standortnachweise lokal halten und beim Stadtpass-Aufruf oder bei App-Rückkehr abgleichen. Erst der Server bestätigt den Stempel.',
    audience: 'Angemeldete Nutzer', availability: 'Umgesetzt · reale Gerätefreigabe separat prüfen',
    href: 'https://benefitsi.de/stadt/annweiler/memories', source: 'App: docs/memory-offline-sync-2026-09-29.md',
  },
  {
    id: 'app-premium-trial', title: 'Premium-Testzugang', group: 'app',
    description: 'Premium einmal pro Konto 14 Tage testen und dabei genau einen Premium-Vorteil kostenlos einlösen.',
    audience: 'Registrierte Nutzer ohne bereits genutzten Trial', availability: 'Testzugang · bezahlte Käufe derzeit deaktiviert',
    href: 'https://benefitsi.de/premium', source: 'App: lib/pages/app/premium/premium_widget.dart; lib/features/subscriptions/trial_premium_deal_notice.dart',
  },
  {
    id: 'app-post-scan-feedback', title: 'Feedback nach dem Besuch', group: 'app',
    description: 'Nach einem geeigneten Scan Besuchsfeedback abgeben; eine konfigurierte Feedback-Belohnung kann dazugehören.',
    audience: 'Berechtigte Nutzer bei freigeschalteten Partnern', availability: 'Partnerrecht und Feedback-Regeln',
    href: '/#partners', source: 'App: lib/features/feedback/post_scan_feedback_service.dart; lib/components/post_scan_feedback/post_scan_feedback_sheet.dart',
  },
  {
    id: 'app-notifications', title: 'Benachrichtigungen', group: 'app',
    description: 'Kontobezogene Mitteilungen in der App laden und ihren Lesestatus verwalten.',
    audience: 'Angemeldete Nutzer', availability: 'Mitteilungsfunktion implementiert · Einstellungssteuerung noch nicht verfügbar',
    href: 'https://benefitsi.de/app', source: 'App: lib/features/notifications/notification_service.dart',
  },
  {
    id: 'app-order-entry', title: 'Bestellen aus der App', group: 'app',
    description: 'Vom Partnerdetail in den passenden Bestellablauf wechseln, wenn der veröffentlichte Katalog Bestellungen erlaubt.',
    audience: 'Nutzer und Gäste', availability: 'Globaler Schalter, Partnerfreigabe und Angebot nötig',
    href: '/commerce', source: 'App: lib/features/bookings/partner_booking_action.dart; docs/commerce-rollout.md',
  },
  {
    id: 'partner-standard-profile', title: 'Standardprofil auf der Stadtseite', group: 'partner',
    description: 'Kostenlose Präsenz mit Kontakt, Öffnungszeiten und Vorteilen innerhalb der passenden Stadtseite.',
    audience: 'Partner Free und Pro', availability: 'Veröffentlichungsfreigabe erforderlich',
    href: '/#partners', source: 'Web: src/lib/partners/standard-partner-destination.ts; src/components/partner/PartnerPriceCatalog.tsx',
  },
  {
    id: 'partner-profile-management', title: 'Betriebsdaten und Öffnungszeiten', group: 'partner',
    description: 'Profil, Kontaktdaten, reguläre Öffnungszeiten und abweichende Zeiten im Partnerbereich pflegen.',
    audience: 'Inhaber und berechtigte Verwalter', availability: 'Rollen- und tarifabhängig',
    href: '/#partners', source: 'Admin: app/partner/page.tsx; app/partner-admin.tsx; lib/partners/entitlements.ts',
  },
  {
    id: 'partner-team', title: 'Team und Scannerzugänge', group: 'partner',
    description: 'Teamzugänge mit Verwaltungs- oder Scannerrolle zuordnen. Free umfasst 3, Pro 10 Teammitglieder.',
    audience: 'Partner Free und Pro', availability: 'Rollenprüfung und Teamlimit',
    href: '/#partners', source: 'Admin: lib/reward-config.ts; components/partner/partner-plan-panel.tsx',
  },
  {
    id: 'partner-offers', title: 'Angebote und Deal-Drop-Kontingent', group: 'partner',
    description: 'Normale Angebote und Happy Hour ohne Mengenlimit verwalten. Für Deal Drops gilt ein eigenes monatliches Veröffentlichungskontingent.',
    audience: 'Partner Free und Pro', availability: 'Free: 1 Drop · Pro: vorläufig ohne Monatslimit',
    href: '/#partners', source: 'Admin: components/partner/partner-drop-usage.tsx; lib/partners/entitlements.ts',
  },
  {
    id: 'partner-menu-management', title: 'Menü und Artikelverwaltung', group: 'partner',
    description: 'Speisen, Kategorien und verfügbare Artikel pflegen; Bestelloptionen werden im Commerce-Bereich ergänzt.',
    audience: 'Berechtigte Partner und Benefitsi-Team', availability: 'Partnerdaten und Modulrechte',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx; app/partner/commerce/page.tsx',
  },
  {
    id: 'partner-ai-menu', title: 'Menüimport mit KI', group: 'partner',
    description: 'Speisekarten für die Übernahme in strukturierte Menüdaten vorbereiten. Pro enthält bis zu zwei Importe pro Abo-Monat.',
    audience: 'Partner Pro', availability: 'Betriebs-, Kosten- und Importfreigabe erforderlich',
    href: '/#partners', source: 'Admin: components/partner/partner-plan-panel.tsx; lib/partners/entitlements.ts',
  },
  {
    id: 'partner-microsite', title: 'Eigene Partner-Microsite', group: 'partner',
    description: 'Eine eigene Partnerseite unter benefitsi.de/partner/{slug} mit freigegebenem Profil, Angeboten, Menü und Kontakt veröffentlichen.',
    audience: 'Partner Pro', availability: 'Aktiver Partner, Tarif und Veröffentlichung nötig',
    href: '/microsites', source: 'Admin: lib/microsites.ts; Web: src/config/site.ts; src/lib/partners/projected-partner-path.ts',
  },
  {
    id: 'partner-microsite-builder', title: 'Microsite-Builder und Vorschau', group: 'partner',
    description: 'Layout und Inhalte im Builder prüfen und den Entwurf durch Freigabe bis zur Veröffentlichung führen.',
    audience: 'Benefitsi-Team', availability: 'Admin-Verwaltung · Veröffentlichung gesondert',
    href: '/microsites', source: 'Admin: app/microsite-builder/[partner]/page.tsx; app/microsite-preview/[partner]/page.tsx',
  },
  {
    id: 'partner-rich-media', title: 'Videos und virtuelle Einblicke', group: 'partner',
    description: 'Freigegebene erweiterte Medien in der eigenen Microsite einsetzen.',
    audience: 'Partner Pro', availability: 'Tarif- und Veröffentlichungsfreigabe',
    href: '/microsites', source: 'Admin: lib/microsite-rich-media.ts; lib/partners/entitlements.ts',
  },
  {
    id: 'partner-statistics', title: 'Partnerstatistik', group: 'partner',
    description: 'Verfügbare Messdaten zu Partneraktivität und Vorteilen auswerten. Free betrachtet 30 Tage, Pro 365 Tage.',
    audience: 'Partner Free und Pro', availability: 'Messdaten und Zugriffsrechte erforderlich',
    href: '/analytics', source: 'Admin: lib/partners/analytics.ts; components/partner/partner-statistics.tsx',
  },
  {
    id: 'partner-statistics-export', title: 'Erweiterte Auswertung und Export', group: 'partner',
    description: 'Vertiefte Partnerauswertungen und den Statistikexport entsprechend den erteilten Rechten nutzen.',
    audience: 'Partner Pro', availability: 'analytics.advanced und analytics.export',
    href: '/analytics', source: 'Admin: lib/partners/entitlements.ts; components/partner/partner-statistics.tsx',
  },
  {
    id: 'partner-feedback', title: 'Besuchsfeedback verwalten', group: 'partner',
    description: 'Feedback und zugehörige Belohnungen mit einem berechtigten Verwaltungszugang bearbeiten.',
    audience: 'Partner Pro', availability: 'Pro und passendes Verwaltungsrecht',
    href: '/#partners', source: 'Admin: lib/partners/entitlements.ts; Database: supabase/migrations/20261002115743_partner_catalog_v2.sql',
  },
  {
    id: 'partner-founder', title: 'Pro Standard und Founder-Angebote', group: 'partner',
    description: 'Standard und Founder sind Vertragsangebote für Pro. Founder: sechs Gratismonate ab Aktivierung mit monatlichem Ausstieg; nur bei Fortsetzung folgen zwölf bezahlte Monate.',
    audience: 'Partner; Founder nur nach geprüfter Zulassung', availability: 'Vertrags- und Abrechnungsfreigabe erforderlich',
    href: '/#partners', source: 'Admin: components/partner/partner-plan-panel.tsx; Web: src/components/partner/PartnerPriceCatalog.tsx',
  },
  {
    id: 'partner-billing', title: 'Verträge, Laufzeiten und Rechte', group: 'partner',
    description: 'Aktiven Tarif, Laufzeit, Zusatzverträge, Kontingente und befristete Ausnahmen getrennt nachvollziehen. Preise kommen aus dem versionierten Katalog.',
    audience: 'Partnerinhaber und Benefitsi-Team', availability: 'Abrechnung nur nach gesonderter Freigabe',
    href: '/#partners', source: 'Admin: components/partner/partner-plan-panel.tsx; lib/partners/entitlements.ts',
  },
  {
    id: 'partner-commerce-module', title: 'Zusatzmodul: Bestellungen und Termine', group: 'partner',
    description: 'Bestellungen, Abholung oder Lieferung sowie Tisch- und Terminbuchungen bearbeiten. Vertrag und tatsächliche Betriebsbereitschaft werden getrennt geprüft.',
    audience: 'Partner Pro mit Zusatzvertrag', availability: 'Modul-, Partner- und Zahlungsfreigaben erforderlich',
    href: '/commerce', source: 'Admin: app/partner/commerce/page.tsx; App: docs/commerce-rollout.md',
  },
  {
    id: 'partner-seo-module', title: 'Zusatzmodul: SEO-Monitoring', group: 'partner',
    description: 'Suchmaschinen-Messdaten für bis zu fünf Keywords beobachten, wenn ein gültiger Messzugang eingerichtet ist.',
    audience: 'Partner Pro mit Zusatzvertrag', availability: 'Messquelle sowie Kosten- und Betriebsfreigabe nötig',
    href: '/seo', source: 'Admin: app/partner/seo/page.tsx; components/partner/partner-plan-panel.tsx',
  },
  {
    id: 'partner-marketing-planned', title: 'Marketing-Nachrichten', group: 'partner',
    description: 'Push-, In-App- und Comeback-Nachrichten als Entwurf vorbereiten. Versand, Planung und automatische Aktivierung sind noch nicht verfügbar.',
    audience: 'Partner Pro', availability: 'Entwürfe nach Freigabe · Versand noch nicht verfügbar',
    href: '/partner/crm', source: 'Admin: lib/partners/benefits-v1.json; components/partner/partner-crm-workspace.tsx',
  },
  {
    id: 'partner-crm', title: 'Kundenbindung und Redaktion', group: 'partner',
    description: 'Potenzielle Besuchsgruppen prüfen, Kampagnenentwürfe speichern sowie Blogartikel und Inhaberinterviews anfragen. Gruppen belegen keine erreichbaren Empfänger; Beiträge werden redaktionell freigegeben.',
    audience: 'Partner Pro', availability: 'Tarifrecht und tatsächliche CRM-Freigabe erforderlich',
    href: '/partner/crm', source: 'Admin: app/partner/crm/page.tsx; lib/partners/benefits-v1.json; components/partner/partner-crm-workspace.tsx',
  },
  {
    id: 'partner-extra-ai-planned', title: 'Geplantes Zusatzmodul: weitere KI-Importe', group: 'partner',
    description: 'Zusätzliche Menüimporte sind im öffentlichen Katalog als künftige Erweiterung vorgesehen.',
    audience: 'Partner', availability: 'Geplant · noch nicht buchbar',
    href: 'https://benefitsi.de/partner-werden#tarife', source: 'Database: supabase/migrations/20260930190000_partner_public_integration.sql (future_modules.extra_ai)',
  },
  {
    id: 'partner-sponsored-planned', title: 'Geplantes Zusatzmodul: Sponsored-Platzierung', group: 'partner',
    description: 'Eine zusätzliche hervorgehobene Platzierung ist als künftiges Modul im Katalog hinterlegt.',
    audience: 'Partner', availability: 'Geplant · noch nicht buchbar',
    href: 'https://benefitsi.de/partner-werden#tarife', source: 'Database: supabase/migrations/20260930190000_partner_public_integration.sql (future_modules.sponsored)',
  },
  {
    id: 'partner-lucky-scan-planned', title: 'Geplantes Zusatzmodul: Lucky Scan', group: 'partner',
    description: 'Lucky Scan ist als zukünftiges Modul benannt. Der Katalog belegt noch keinen nutzbaren Produktablauf.',
    audience: 'Partner', availability: 'Geplant · noch nicht buchbar',
    href: 'https://benefitsi.de/partner-werden#tarife', source: 'Database: supabase/migrations/20260930190000_partner_public_integration.sql (future_modules.lucky_scan)',
  },
  {
    id: 'deal-two-for-one', title: '2 für 1', group: 'deals', benefitIcon: 'two_for_one',
    description: 'Zwei definierte Artikel zum Preis von einem. Der direkte Vorteil wird vor dem QR-Scan ausgewählt.',
    audience: 'Je Angebot: Free, Premium oder beide', availability: 'Aktives Angebot und Einlösebedingungen',
    href: '/#partners', source: 'Admin: lib/reward-config.ts; app/partner-admin.tsx (dealExplanations.two_for_one)',
  },
  {
    id: 'deal-discount', title: 'Rabatt', group: 'deals', benefitIcon: 'discount',
    description: 'Einen festen Betrag oder prozentualen Rabatt gewähren; Mindestumsatz und Rabattobergrenze können konfiguriert werden.',
    audience: 'Zielgruppe des jeweiligen Angebots', availability: 'Direkt auswählbarer Vorteil',
    href: '/#partners', source: 'Admin: lib/reward-config.ts; app/partner-admin.tsx (dealFieldHelp)',
  },
  {
    id: 'deal-free-item', title: 'Gratisartikel', group: 'deals', benefitIcon: 'free_item',
    description: 'Einen konkret benannten Artikel nach Auswahl und bestätigter Einlösung ausgeben.',
    audience: 'Zielgruppe des jeweiligen Angebots', availability: 'Direkt auswählbarer Vorteil',
    href: '/#partners', source: 'Admin: lib/reward-config.ts; app/partner-admin.tsx (dealExplanations.free_item)',
  },
  {
    id: 'deal-bonus-stamps', title: 'Bonusstempel', group: 'deals', benefitIcon: 'bonus_stamp',
    description: 'Zusätzliche Stempel beim berechtigten Scan automatisch auf den festgelegten Stempelkartenpfad anrechnen.',
    audience: 'Zielgruppe und Stempelkartenpfad des Angebots', availability: 'Automatisch beim Scan',
    href: '/#partners', source: 'Admin: lib/reward-config.ts (inferBenefitCategory, rewardTrackTargetOptions)',
  },
  {
    id: 'deal-welcome', title: 'Willkommensdeal und Willkommensbonus', group: 'deals', benefitIcon: 'welcome',
    description: 'Den ersten qualifizierten Besuch belohnen. Artikel, Rabatt und 2 für 1 werden ausgewählt; Bonusstempel laufen automatisch.',
    audience: 'Erstmals berechtigte Nutzer', availability: 'Willkommens-Auslöser und Angebotszielgruppe',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx (dealExplanations.welcome); lib/benefit-taxonomy.ts',
  },
  {
    id: 'deal-time-bonus', title: 'Zeitbonus', group: 'deals', benefitIcon: 'time_bonus',
    description: 'Eine Rückkehr innerhalb eines konfigurierten Zeitraums belohnen, etwa mit einem zusätzlichen Stempel.',
    audience: 'Nutzer mit qualifizierender Rückkehr', availability: 'Zeitfenster und Belohnungsformat',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx (dealExplanations.comeback); lib/reward-config.ts (canonicalTriggerKey)',
  },
  {
    id: 'deal-comeback', title: 'Comeback-Deal und Comeback-Bonus', group: 'deals', benefitIcon: 'comeback',
    description: 'Nutzer nach einer definierten Zeit ohne Besuch reaktivieren. Inaktivität und optionale Besuchsfilter bestimmen die Berechtigung.',
    audience: 'Inaktive, erneut berechtigte Nutzer', availability: 'Inaktivitätszeitraum und Angebotszielgruppe',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx (dealExplanations.comeback_inactive)',
  },
  {
    id: 'deal-happy-hour', title: 'Happy Hour', group: 'deals', benefitIcon: 'happy_hour',
    description: 'Einen Vorteil an bestimmten Wochentagen und innerhalb eines Zeitfensters anbieten. Das Fenster wird bei der Einlösung erneut geprüft.',
    audience: 'Je Angebot: Free, Premium oder beide', availability: 'Zeitgesteuerte, direkte Auswahl',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx (dealExplanations.happy_hour); lib/reward-config.ts',
  },
  {
    id: 'deal-permanent-discount', title: 'Dauerrabatt', group: 'deals', benefitIcon: 'permanent_discount',
    description: 'Einen Rabatt automatisch anwenden, wenn kein anderer direkter Vorteil gewählt wurde. Er ist kein zusätzlich kombinierbarer Rabatt.',
    audience: 'Zielgruppe des jeweiligen Angebots', availability: 'Automatischer Fallback',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx (dealExplanations.permanent_discount)',
  },
  {
    id: 'deal-drop', title: 'Deal Drop', group: 'deals', benefitIcon: 'deal_drop',
    description: 'Zeitlich oder mengenmäßig begrenzter Vorteil mit Gültigkeit, Bestand und optionaler Reservierung bei Auswahl.',
    audience: 'Zielgruppe des jeweiligen Angebots', availability: 'Bestand, Zeitfenster und Partnerkontingent',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx (dealExplanations.limited_drop); lib/partners/entitlements.ts',
  },
  {
    id: 'deal-birthday', title: 'Geburtstagsvorteil', group: 'deals', benefitIcon: 'birthday',
    description: 'Einen Vorteil zum Geburtstag auslösen. Das Belohnungsformat bestimmt, ob er ausgewählt oder automatisch vergeben wird.',
    audience: 'Berechtigte Nutzer mit passendem Anlass', availability: 'Geburtstags-Auslöser und Angebotsbedingungen',
    href: '/#partners', source: 'Admin: app/partner-admin.tsx (dealExplanations.birthday)',
  },
  {
    id: 'deal-streak', title: 'Streak und Streak-Bonus', group: 'deals', benefitIcon: 'streak',
    description: 'Eine konfigurierte Besuchsserie belohnen; Schwellenwert, Zielgruppe und Ausgabeformat gehören zur Regel.',
    audience: 'Nutzer mit erfüllter Besuchsserie', availability: 'Regelbasierter Auslöser',
    href: '/#partners', source: 'Admin: lib/reward-config.ts; lib/benefit-taxonomy.ts; app/partner-admin.tsx',
  },
  {
    id: 'deal-challenge', title: 'Challenge und Challenge-Bonus', group: 'deals', benefitIcon: 'challenge',
    description: 'Ein definiertes Besuchsziel mit einer Belohnung verbinden und den persönlichen Challenge-Fortschritt verfolgen.',
    audience: 'Berechtigte Challenge-Teilnehmer', availability: 'Konfiguriertes Ziel und Angebotsbedingungen',
    href: '/#partners', source: 'Admin: lib/reward-config.ts; App: lib/features/rewards/user_challenge_model.dart',
  },
  {
    id: 'deal-milestones', title: 'Stempelkarten-Meilensteine', group: 'deals', benefitIcon: 'reward',
    description: 'Belohnungen an Stempelschwellen festlegen und einem Basis- oder Premium-Pfad zuordnen; die Karte unterstützt bis zu zehn Stempel.',
    audience: 'Free, Premium oder beide je Meilenstein', availability: 'Partnerprogramm und berechtigter Pfad',
    href: '/#partners', source: 'Admin: lib/reward-config.ts (MAX_STAMP_CARD_STAMPS, milestoneAudienceOptions)',
  },
  {
    id: 'deal-activation-audience', title: 'Zielgruppen und Aktivierungsregeln', group: 'deals', benefitIcon: 'audience',
    description: 'Free, Premium, beide oder die Free-Testphase gezielt ansprechen. Direkte Auswahl, automatischer Scanbonus und Fallback sind getrennte Abläufe.',
    audience: 'Partner und Benefitsi-Team', availability: 'Pro Besuch höchstens ein direkter Vorteil',
    href: '/#partners', source: 'Admin: lib/reward-config.ts (audienceOptions, benefitCategoryOptions)',
  },
  {
    id: 'platform-city-network', title: 'Städteportal und Stadtfreigaben', group: 'platform',
    description: 'Städte unter benefitsi.de/stadt/{slug} bündeln. DRAFT, PRELAUNCH und PUBLIC steuern die Veröffentlichungs- und Suchmaschinenregeln.',
    audience: 'Besucher und Benefitsi-Team', availability: 'Stadtbezogene Freigabe; Konfiguration ist kein Laufzeitstatus',
    href: '/city-pages', source: 'Web: src/config/site.ts; src/config/city-publication.ts; src/config/city-portal-profiles.ts',
  },
  {
    id: 'platform-city-editor', title: 'Stadtseiten-Editor', group: 'platform',
    description: 'Stadtinhalte, Entdecken-Bereiche, Community und Newsletter in ihren jeweiligen Verwaltungsansichten bearbeiten.',
    audience: 'Benefitsi-Team', availability: 'Admin-Verwaltung',
    href: '/city-pages', source: 'Admin: app/city-pages/[citySlug]/page.tsx; app/city-pages/[citySlug]/discovery/page.tsx',
  },
  {
    id: 'platform-city-worlds', title: 'Die sechs Stadtbereiche', group: 'platform',
    description: 'Aktuell, Entdecken, Veranstaltungen, Touren und Guides, Stadtwissen sowie Vorteile strukturieren das öffentliche Stadtangebot.',
    audience: 'Stadtbesucher', availability: 'Veröffentlichte Stadtinhalte',
    href: 'https://benefitsi.de/stadt/annweiler', source: 'Web: src/config/city-hub-config.ts',
  },
  {
    id: 'platform-city-directory', title: 'Orte und lokale Verzeichnisse', group: 'platform',
    description: 'Sehenswürdigkeiten, Essen und Trinken, Geschäfte und Unterkünfte mit passenden Detailseiten erschließen.',
    audience: 'Stadtbesucher und Betriebe', availability: 'Freigegebene und aktuelle Datensätze',
    href: 'https://benefitsi.de/stadt/annweiler/entdecken', source: 'Web: src/lib/cities/city-urls.ts; src/app/stadt/[citySlug]/geschaefte/page.tsx',
  },
  {
    id: 'platform-city-map', title: 'Stadtkarte und Suche', group: 'platform',
    description: 'Stadtinhalte über Karte und Suche finden und die zugehörigen öffentlichen Details öffnen.',
    audience: 'Stadtbesucher', availability: 'Verfügbare Stadt- und Geodaten',
    href: 'https://benefitsi.de/stadt/annweiler/karte', source: 'Web: src/app/stadt/[citySlug]/karte/page.tsx; src/app/stadt/[citySlug]/suche/page.tsx',
  },
  {
    id: 'platform-community', title: 'Community, Treffen und Mitmachen', group: 'platform',
    description: 'Öffentliche Treffen und Vereine entdecken sowie Vorschläge über die vorgesehenen Mitmachen-Abläufe einreichen.',
    audience: 'Stadtbesucher und Redaktion', availability: 'Moderation und Veröffentlichung erforderlich',
    href: 'https://benefitsi.de/stadt/annweiler/community/treffen', source: 'Web: src/app/stadt/[citySlug]/community/treffen/page.tsx; src/app/stadt/[citySlug]/mitmachen/page.tsx',
  },
  {
    id: 'platform-editorial', title: 'Redaktion, Stadt- und Partnerartikel', group: 'platform',
    description: 'Artikel entwerfen, als Vorschau prüfen und für die zugehörige Stadt oder den Partner veröffentlichen.',
    audience: 'Benefitsi-Redaktion', availability: 'Redaktioneller Veröffentlichungsablauf',
    href: '/editorial', source: 'Admin: app/editorial/page.tsx; Web: src/lib/editorial/city-posts.ts; src/lib/editorial/partner-posts.ts',
  },
  {
    id: 'platform-newsletter-downloads', title: 'Stadtnewsletter und Downloads', group: 'platform',
    description: 'Stadtspezifische Newsletter und Downloads verwalten; Bestätigung, Abmeldung und gegebenenfalls Download-Freischaltung sind eigene Abläufe.',
    audience: 'Interessierte Stadtbesucher und Redaktion', availability: 'Konfiguration, Einwilligung und Versandbereitschaft',
    href: '/city-pages', source: 'Admin: app/city-pages/[citySlug]/newsletter/page.tsx; Web: src/app/stadt/[citySlug]/downloads/page.tsx',
  },
  {
    id: 'platform-web-account', title: 'Webkonto, Merkliste und Wochenendideen', group: 'platform',
    description: 'Guides, Orte und Unterkünfte merken sowie eigene Stempel, Treffen und passende Wochenendideen im Konto ansehen.',
    audience: 'Registrierte Webnutzer', availability: 'Anmeldung und verfügbare Kontodaten',
    href: 'https://benefitsi.de/konto', source: 'Web: src/components/account/AccountWorkspace.tsx; src/components/account/AccountWeekend.tsx',
  },
  {
    id: 'platform-city-operations', title: 'Stadtinhalte prüfen und aktuell halten', group: 'platform',
    description: 'Quellen, Aktualität und Veröffentlichungsreife von Stadtinhalten in den operativen Ansichten prüfen.',
    audience: 'Benefitsi-Team', availability: 'Admin-Prüfung und Datengrundlage',
    href: '/city-operations', source: 'Admin: app/city-operations/page.tsx; app/city-operations/[contentType]/[contentId]/page.tsx',
  },
  {
    id: 'platform-agents', title: 'Agenten und Automatisierung', group: 'platform',
    description: 'Konfigurierte Agenten, Aufgaben und Abläufe zentral einsehen. Der tatsächliche Ausführungszustand kommt aus den jeweiligen Betriebsdaten.',
    audience: 'Benefitsi-Team', availability: 'Konfiguration und Laufzeitdaten getrennt prüfen',
    href: '/agents', source: 'Admin: app/agents/page.tsx; app/automation/page.tsx',
  },
  {
    id: 'platform-seo', title: 'SEO-Zentrale', group: 'platform',
    description: 'Suchmaschinenarbeit, Partnervergleich und SEO-Automatisierung über die vorhandenen Admin-Bereiche bearbeiten.',
    audience: 'Benefitsi-Team', availability: 'Messquellen und jeweilige Freigaben',
    href: '/seo', source: 'Admin: app/seo/page.tsx; app/seo/partnervergleich/page.tsx; app/seo/automatisierung/page.tsx',
  },
  {
    id: 'platform-media', title: 'Zentrale Medienverwaltung', group: 'platform',
    description: 'Medien für Stadtinhalte und Partneroberflächen in der vorhandenen Verwaltungsansicht bearbeiten.',
    audience: 'Benefitsi-Team', availability: 'Admin-Verwaltung und Medienrechte',
    href: '/media', source: 'Admin: app/media/page.tsx',
  },
  {
    id: 'platform-knowledge-system', title: 'Wissen und Systemverwaltung', group: 'platform',
    description: 'Produktwissen und vorhandene Systemansichten für die operative Arbeit öffnen.',
    audience: 'Benefitsi-Team', availability: 'Admin-Zugriff erforderlich',
    href: '/wissen', source: 'Admin: app/wissen/page.tsx; app/system/page.tsx',
  },
]

/** Separate modules and planned extensions; a contract alone never proves readiness. */
export const addOns: EcosystemEntry[] = ecosystemCatalog.filter(entry =>
  ['partner-commerce-module', 'partner-seo-module', 'partner-extra-ai-planned', 'partner-sponsored-planned', 'partner-lucky-scan-planned'].includes(entry.id),
)

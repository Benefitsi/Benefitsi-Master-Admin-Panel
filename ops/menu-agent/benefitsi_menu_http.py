"""Authenticated menu HTTP seam. Bridge owns authentication and 6 MiB body bound."""
from benefitsi_menu_service import extract_menu, MenuAgentBusy
SAFE_ERRORS=frozenset(['Bitte Kartenteile mit höchstens acht Seiten verwenden.', 'Bitte eine PDF-Datei oder bis zu acht Fotos hochladen.', 'Bitte eine einzelne PDF-Datei oder mehrere Fotos hochladen.', 'Bitte kleinere Kartenteile mit höchstens 200 Artikeln verwenden.', 'Bitte kleinere Kartenteile mit höchstens 40 Kategorien verwenden.', 'Dateien müssen zusammen zwischen 1 Byte und 4 MiB groß sein.', 'Dateiformat nicht unterstützt.', 'Der Menüentwurf enthält ungültige Hinweise.', 'Der Menüentwurf enthält ungültigen Text.', 'Der Menüentwurf ist zu umfangreich.', 'Der native ChatGPT/Codex-Endpunkt unterstützt das erforderliche Ausgabelimit für Menüimporte nicht. Bitte einen begrenzbaren Anbieter wählen.', 'Die Datei ist unlesbar, zu umfangreich oder hat mehr als acht Seiten.', 'Die Kostenfreigabe für das ausgewählte Menümodell fehlt. Benefitsi muss die Anbietergrenzen prüfen.', 'Die Speisekarte enthält zu viel Text. Bitte aufteilen.', 'Die Speisekarte ist zu umfangreich.', 'Die Speisekarte wurde nicht vollständig erkannt.', 'Die Texterkennung hat zu lange gedauert. Bitte kleinere Kartenteile verwenden.', 'Die Währung ist ungültig.', 'Es wurde kein lesbarer Text gefunden.', 'Hermes konnte keinen vollständigen Menüentwurf erstellen.', 'Leere Kategorie.', 'Mindestens eine Seite ist unlesbar. Bitte erneut fotografieren.', 'Ungültige Auftrags-ID.', 'Ungültige Datei.', 'Ungültige Dateiübertragung.', 'Ungültige Kategorie.', 'Ungültige Texterkennung.', 'Ungültige Textkoordinaten.', 'Ungültiger Artikel.', 'Ungültiger Artikelpreis.', 'Ungültiger Menü-Auftrag.', 'durable_menu_journal_required', 'incomplete_provider_result', 'invalid_journal_path', 'invalid_operation', 'invalid_provider_usage', 'invalid_v2_request', 'menu_profile_unavailable', 'menu_validation_failed', 'operation_dispatch_not_permitted', 'operation_input_conflict', 'operation_outcome_pending_review', 'operation_result_unavailable', 'serialized_request_too_large', 'unexpected_provider_content'])

def handle_menu(data):
    try:
        if not isinstance(data,dict) or type(data.get('schemaVersion')) is not int or data.get('schemaVersion')!=2:
            raise ValueError('Ungültiger Menü-Auftrag.')
        return extract_menu(data),200
    except MenuAgentBusy:
        return {'error':'Der Menü-Agent ist ausgelastet.'},429
    except ValueError as error:
        message=str(error)
        return {'error':message if message in SAFE_ERRORS else 'Ungültiger Menü-Auftrag.'},400
    except Exception:
        return {'error':'menu_operation_unavailable'},503

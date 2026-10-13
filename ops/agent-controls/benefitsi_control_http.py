"""Bounded endpoints mounted after the existing bridge authentication check."""
import json

ROUTES={'/hermes/profiles':8192,'/benefitsi/knowledge':65536,'/hermes/menu-extract':6*1024*1024}
CONFLICTS={'configuration_changed','model_busy','knowledge_conflict'}
UNAVAILABLE={'native_unavailable','catalog_unavailable','persist_failed','readback_failed','context_unavailable','context_changed','knowledge_unavailable','knowledge_changed','knowledge_readback_failed'}
ERRORS=CONFLICTS|UNAVAILABLE|{'invalid_request','deterministic_profile','unsupported_profile','confirmation_required','unauthenticated_provider','unavailable_model','context_invalid_input','context_profile_forbidden','context_file_forbidden','context_file_missing','context_symlink','context_not_utf8','context_too_large','knowledge_invalid_input','knowledge_file_forbidden','knowledge_file_missing','knowledge_symlink','knowledge_not_utf8','knowledge_too_large','knowledge_source_invalid'}

def dispatch(data,path,source_root):
    if not isinstance(data,dict):raise ValueError('invalid_request')
    if path=='/hermes/profiles':
        if data.get('action') in ('context-list','context-read'):
            from benefitsi_agent_context import agent_context_request
            return agent_context_request(data)
        from benefitsi_agent_models import agent_models_request
        return agent_models_request(data)
    from benefitsi_knowledge import benefitsi_knowledge_request
    return benefitsi_knowledge_request(data,vault_root=source_root('benefitsi-obsidian'))

def handle_control_post(handler,source_root,operation=dispatch):
    path=handler.path
    if not any(path.startswith(route) for route in ROUTES):return False
    if not handler.authorized():handler.send_json({'error':'unauthorized'},401);return True
    if path not in ROUTES:handler.send_json({'error':'invalid_request'},400);return True
    try:
        raw_size=handler.headers.get('Content-Length','')
        if not raw_size.isdecimal() or len(raw_size)>8:raise ValueError('invalid_request')
        size=int(raw_size)
        if size<=0 or size>ROUTES[path] or handler.headers.get('Transfer-Encoding') or not handler.headers.get('Content-Type','').lower().split(';',1)[0].strip()=='application/json':raise ValueError('invalid_request')
        original_timeout=handler.connection.gettimeout()
        try:
            handler.connection.settimeout(10)
            raw=handler.rfile.read(size)
        finally:handler.connection.settimeout(original_timeout)
        if len(raw)!=size:raise ValueError('invalid_request')
        try:data=json.loads(raw.decode('utf-8'))
        except (ValueError,UnicodeError):raise ValueError('invalid_request') from None
        if path=='/hermes/menu-extract':
            from benefitsi_menu_http import handle_menu
            payload,status=handle_menu(data)
            handler.send_json(payload,status)
        else:handler.send_json(operation(data,path,source_root),200)
    except ValueError as error:
        code=str(error) if str(error) in ERRORS else 'invalid_request'
        handler.send_json({'error':code},409 if code in CONFLICTS else 503 if code in UNAVAILABLE else 400)
    except PermissionError:handler.send_json({'error':'permission_denied'},403)
    except Exception:handler.send_json({'error':'operation_unavailable'},503)
    return True

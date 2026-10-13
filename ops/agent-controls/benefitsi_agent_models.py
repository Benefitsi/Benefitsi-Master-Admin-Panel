"""Bounded native Hermes model controls. Dispatch authentication belongs to M1 bridge."""
from __future__ import annotations

import contextlib
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

PROFILES = frozenset({'ben', 'benefitsi-content', 'benefitsi-finance', 'benefitsi-seo',
                      'benefitsi-menu', 'city-annweiler'})
ACTIONS = frozenset({'model-options', 'model-readback', 'model-apply'})
COMMON = frozenset({'schemaVersion', 'action', 'profileId'})
APPLY = frozenset({'provider', 'model', 'confirmed', 'expectedProvider', 'expectedModel',
                   'expectedRevision', 'requestId'})
MAX_RESPONSE = 512 * 1024
IDENTIFIER = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$')
ERRORS = frozenset({'unsupported_profile', 'invalid_request', 'confirmation_required',
                    'native_unavailable', 'catalog_unavailable', 'unauthenticated_provider',
                    'unavailable_model', 'configuration_changed', 'model_busy',
                    'persist_failed', 'readback_failed', 'deterministic_profile'})


def _text(value, maximum=200):
    return isinstance(value, str) and len(value) <= maximum and not any(ord(c) < 32 for c in value)


def _validate(data):
    if not isinstance(data, dict) or type(data.get('schemaVersion')) is not int or data.get('schemaVersion') != 1:
        raise ValueError('invalid_request')
    if not isinstance(data.get('profileId'), str) or not isinstance(data.get('action'), str):
        raise ValueError('invalid_request')
    if data.get('profileId') not in PROFILES:
        raise ValueError('unsupported_profile')
    action = data.get('action')
    if action not in ACTIONS or set(data) - (COMMON | (APPLY if action == 'model-apply' else frozenset())):
        raise ValueError('invalid_request')
    if action == 'model-apply':
        if data.get('confirmed') is not True:
            raise ValueError('confirmation_required')
        if any(not _text(data.get(k)) for k in ('expectedProvider', 'expectedModel')):
            raise ValueError('invalid_request')
        if any(not isinstance(data.get(k), str) or not IDENTIFIER.fullmatch(data[k]) for k in ('provider', 'model')):
            raise ValueError('invalid_request')
        if not isinstance(data.get('expectedRevision'), str) or not re.fullmatch(r'[a-f0-9]{64}', data['expectedRevision']):
            raise ValueError('invalid_request')
        if 'requestId' in data and (not _text(data['requestId'], 80) or not IDENTIFIER.fullmatch(data['requestId'])):
            raise ValueError('invalid_request')
    return data['profileId']


def _profile_root(profile):
    root = Path.home() / '.hermes' / 'profiles' / profile
    for p in (root.parent.parent, root.parent, root):
        try:
            st = p.lstat()
        except OSError:
            raise ValueError('native_unavailable') from None
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
            raise ValueError('native_unavailable')
    config = root / 'config.yaml'
    try:
        st = config.lstat()
    except OSError:
        raise ValueError('native_unavailable') from None
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size > 512 * 1024:
        raise ValueError('native_unavailable')
    return root


class _Native:
    def read(self):
        from hermes_cli.config import load_config
        return load_config()

    def catalog(self, cfg):
        from hermes_cli.config import get_compatible_custom_providers
        from hermes_cli.model_switch_providers import list_authenticated_providers
        model = cfg.get('model', {})
        model = model if isinstance(model, dict) else {'default': model}
        return list_authenticated_providers(
            current_provider=str(model.get('provider') or ''), current_model=str(model.get('default', model.get('name', '')) or ''),
            current_base_url=str(model.get('base_url') or ''),
            user_providers=cfg.get('providers') if isinstance(cfg.get('providers'), dict) else {},
            custom_providers=get_compatible_custom_providers(cfg), max_models=128,
            probe_custom_providers=False, probe_current_custom_provider=False,
            non_blocking_catalogs=True, for_picker=True)

    def switch(self, cfg, provider, model):
        from hermes_cli.config import get_compatible_custom_providers
        from hermes_cli.model_switch import switch_model
        current = cfg.get('model', {})
        current = current if isinstance(current, dict) else {'default': current}
        return switch_model(
            raw_input=model, explicit_provider=provider, is_global=True,
            current_provider=str(current.get('provider') or ''),
            current_model=str(current.get('default', current.get('name', '')) or ''),
            current_base_url=str(current.get('base_url') or ''),
            user_providers=cfg.get('providers') if isinstance(cfg.get('providers'), dict) else {},
            custom_providers=get_compatible_custom_providers(cfg))

    def persist(self, cfg, result):
        from hermes_cli.config import save_config
        from hermes_cli.model_switch import apply_model_selection
        from hermes_cli.web_routers._common import _CONFIG_MUTATION_LOCK
        with _CONFIG_MUTATION_LOCK:
            cfg['model'] = apply_model_selection(cfg.get('model', {}), result)
            save_config(cfg)


@contextlib.contextmanager
def _native_scope(profile):
    hermes = Path.home() / '.hermes' / 'hermes-agent'
    sys.path.insert(0, str(hermes))
    try:
        from hermes_cli.web_server_profiles import _config_profile_scope
        with _config_profile_scope(profile):
            from hermes_constants import get_hermes_home
            if Path(get_hermes_home()).resolve() != _profile_root(profile).resolve():
                raise ValueError('native_unavailable')
            yield _Native()
    except ValueError:
        raise
    except Exception:
        raise ValueError('native_unavailable') from None


def _current(cfg):
    if not isinstance(cfg, dict):
        raise ValueError('native_unavailable')
    model = cfg.get('model', {})
    if isinstance(model, str):
        model = {'default': model}
    if not isinstance(model, dict):
        raise ValueError('native_unavailable')
    provider, ident = str(model.get('provider') or ''), str(model.get('default', model.get('name', '')) or '')
    if not _text(provider) or not _text(ident):
        raise ValueError('native_unavailable')
    return {'provider': provider, 'model': ident}


def _revision(cfg, root):
    st = (root / 'config.yaml').stat()
    value = {'selection': _current(cfg), 'mtime': st.st_mtime_ns, 'bytes': st.st_size}
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def _project_providers(raw):
    if not isinstance(raw, list):
        raise ValueError('catalog_unavailable')
    out, seen, total = [], set(), 0
    for row in raw[:64]:
        if not isinstance(row, dict):
            continue
        slug = row.get('slug')
        if not isinstance(slug, str) or not IDENTIFIER.fullmatch(slug) or slug in seen:
            continue
        seen.add(slug)
        models, model_seen = [], set()
        for value in (row.get('models') if isinstance(row.get('models'), list) else [])[:128]:
            ident = value if isinstance(value, str) else value.get('id') if isinstance(value, dict) else None
            if isinstance(ident, str) and IDENTIFIER.fullmatch(ident) and ident not in model_seen and total < 1024:
                models.append({'id': ident, 'label': ident})
                model_seen.add(ident)
                total += 1
        name = row.get('name')
        label = name if _text(name, 160) and name else slug
        source = row.get('source')
        source = source if source in {'built-in', 'hermes', 'canonical', 'user-config', 'model-config'} else 'native'
        out.append({'id': slug, 'label': label, 'authenticated': True, 'models': models, 'source': source})
    return out


def _response(profile, cfg, root):
    finance = profile == 'benefitsi-finance'
    limitations = ['Die bestehende Finanzprüfung arbeitet ohne KI-Modell. Für diesen deterministischen Prüfworkflow ist kein Modellwechsel verfügbar.'] if finance else []
    if profile == 'benefitsi-menu':
        if not all(os.environ.get(key) for key in ('MENU_OPERATION_DB','MENU_SUPABASE_URL','MENU_SUPABASE_SERVICE_KEY')):
            limitations.append('Die Live-Konfiguration für bezahlte Menüimporte ist noch nicht vollständig eingerichtet. Solange Journal und Datenbankfreigabe fehlen, startet kein Menü-Modellaufruf.')
        limitations.append('Menüimporte verwenden diese Auswahl. Für zusätzliche Anbieter und Modelle müssen geprüfte Kosten- und Aufrufgrenzen vorliegen; andernfalls startet kein Modellaufruf. Der native ChatGPT/Codex-Endpunkt kann das erforderliche Ausgabelimit nicht garantieren und ist für Menüimporte gesperrt.')
    return {'schemaVersion': 1, 'hostId': 'm1-benefitsi', 'profileId': profile,
            'checkedAt': datetime.now(timezone.utc).isoformat(), 'current': _current(cfg),
            'revision': _revision(cfg, root),
            'starter': {'mode': 'deterministic' if finance else 'profile-default',
                        'appliesToNewJobs': not finance,
                        'limitations': limitations}}


@contextlib.contextmanager
def _mutation_lock(root):
    fd = os.open(root / '.agent-model-change.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('model_busy')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('model_busy') from None
        yield
    finally:
        os.close(fd)


def _request_in_process(data):
    profile = _validate(data)
    action = data['action']
    if profile == 'benefitsi-finance' and action == 'model-apply':
        raise ValueError('deterministic_profile')
    root = _profile_root(profile)
    lock = _mutation_lock(root) if action == 'model-apply' else contextlib.nullcontext()
    with lock, _native_scope(profile) as native:
        cfg = native.read()
        response = _response(profile, cfg, root)
        if action == 'model-readback':
            return response
        if action == 'model-apply':
            current = response['current']
            if current != {'provider': data['expectedProvider'], 'model': data['expectedModel']} or (
                    'expectedRevision' in data and data['expectedRevision'] != response['revision']):
                raise ValueError('configuration_changed')
            if current == {'provider': data['provider'], 'model': data['model']}:
                return {**response, 'confirmed': True, 'effectiveFor': 'new-jobs', 'changed': False, 'readbackVerified': True}
        try:
            providers = _project_providers(native.catalog(cfg))
        except Exception:
            raise ValueError('catalog_unavailable') from None
        if action == 'model-options':
            return {**response, 'providers': providers}
        row = next((item for item in providers if item['id'] == data['provider']), None)
        if row is None:
            raise ValueError('unauthenticated_provider')
        if not any(item['id'] == data['model'] for item in row['models']):
            raise ValueError('unavailable_model')
        try:
            result = native.switch(cfg, data['provider'], data['model'])
        except Exception:
            raise ValueError('unavailable_model') from None
        if not result.success:
            raise ValueError('unavailable_model')
        latest = native.read()
        if _revision(latest, root) != response['revision']:
            raise ValueError('configuration_changed')
        try:
            native.persist(latest, result)
        except Exception:
            raise ValueError('persist_failed') from None
        try:
            saved = native.read()
            response = _response(profile, saved, root)
            if response['current'] != {'provider': result.target_provider, 'model': result.new_model}:
                raise ValueError('readback_failed')
        except Exception:
            raise ValueError('readback_failed') from None
        return {**response, 'confirmed': True, 'effectiveFor': 'new-jobs', 'changed': True, 'readbackVerified': True}


def agent_models_request(data):
    """Fixed native child: no user-selected command, executable, URL or credential."""
    _validate(data)
    python = Path.home() / '.hermes/hermes-agent/venv/bin/python'
    env = dict(os.environ)
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    try:
        completed = subprocess.run([str(python), '-B', str(Path(__file__).resolve()), '--worker'],
                                   input=json.dumps(data), text=True, capture_output=True,
                                   timeout=35, env=env, check=False)
        if completed.returncode or len(completed.stdout.encode()) > MAX_RESPONSE:
            raise ValueError('native_unavailable')
        result = json.loads(completed.stdout)
        if 'errorCode' in result:
            raise ValueError(result['errorCode'] if result['errorCode'] in ERRORS else 'native_unavailable')
        return result
    except ValueError as error:
        if str(error) in ERRORS:
            raise
        raise ValueError('native_unavailable') from None
    except Exception:
        raise ValueError('native_unavailable') from None


if __name__ == '__main__':
    if sys.argv[1:] != ['--worker']:
        sys.exit(2)
    try:
        raw = sys.stdin.buffer.read(8193)
        if len(raw) > 8192:
            raise ValueError('invalid_request')
        with open(os.devnull, 'w') as quiet, contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
            result = _request_in_process(json.loads(raw))
    except ValueError as error:
        result = {'errorCode': str(error) if str(error) in ERRORS else 'native_unavailable'}
    except Exception:
        result = {'errorCode': 'native_unavailable'}
    body = json.dumps(result, ensure_ascii=False, allow_nan=False)
    if len(body.encode()) > MAX_RESPONSE:
        body = json.dumps({'errorCode': 'catalog_unavailable'})
    sys.stdout.write(body)

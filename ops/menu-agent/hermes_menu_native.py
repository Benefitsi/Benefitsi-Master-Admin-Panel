"""One bounded native Hermes completion for admitted menu v2. No agent/tool loop."""
import contextlib
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace

MAX_BODY=262144
MAX_OUTPUT=24000
MAX_RESPONSE=2*1024*1024

@contextlib.contextmanager
def _prepared_request(selection,messages):
    sys.path.insert(0,str(Path.home()/'.hermes/hermes-agent'))
    from hermes_cli.web_server_profiles import _config_profile_scope
    from hermes_cli.config import load_config
    from hermes_cli.runtime_provider import resolve_runtime_provider
    from agent.auxiliary_client import _plan_aux_call
    with _config_profile_scope('benefitsi-menu'):
        cfg=load_config();model=cfg.get('model',{})
        if (not isinstance(model,dict) or model.get('provider')!=selection['provider']
                or model.get('default')!=selection['model']):
            raise ValueError('native_menu_model_changed')
        if model.get('openai_runtime')=='codex_app_server':
            raise ValueError('native_menu_request_rejected')
        runtime=resolve_runtime_provider(requested=selection['provider'],target_model=selection['model'])
        if runtime.get('api_mode') not in {'chat_completions','anthropic_messages','codex_responses','gemini_native'}:
            raise ValueError('native_menu_request_rejected')
        req,_,_=_plan_aux_call(None,async_mode=False,provider=selection['provider'],model=selection['model'],
            base_url=runtime.get('base_url'),api_key=runtime.get('api_key'),main_runtime=runtime,
            messages=messages,temperature=None,max_tokens=MAX_OUTPUT,tools=[],timeout=90,
            extra_body=None,reasoning_config=None,extra_headers=None,api_mode=runtime.get('api_mode'),route_info=None)
        yield req


def _validate_wire(raw, mode):
    """Validate the actual serialized SDK wire, after all native conversions."""
    if len(raw)>MAX_BODY:
        raise ValueError('native_menu_request_rejected')
    try: body=json.loads(raw)
    except (TypeError,ValueError): raise ValueError('native_menu_request_rejected') from None
    if not isinstance(body,dict): raise ValueError('native_menu_request_rejected')
    if body.get('tools') or body.get('functions') or body.get('mcp_servers') or body.get('web_search_options'):
        raise ValueError('native_menu_request_rejected')
    if body.get('tool_choice') not in (None,'none') or body.get('function_call') not in (None,'none'):
        raise ValueError('native_menu_request_rejected')
    if body.get('service_tier') not in (None,'default','standard') or body.get('n',1)!=1:
        raise ValueError('native_menu_request_rejected')
    if mode=='gemini_native':
        config=body.get('generationConfig')
        if not isinstance(config,dict) or config.get('candidateCount',1)!=1 or body.get('toolConfig'):
            raise ValueError('native_menu_request_rejected')
        caps=[config.get('maxOutputTokens')]
    else:
        caps=[body[k] for k in ('max_tokens','max_completion_tokens','max_output_tokens') if k in body]
    if not caps or any(type(n) is not int or not 0<n<=MAX_OUTPUT for n in caps):
        raise ValueError('native_menu_request_rejected')
    return body


@contextlib.contextmanager
def _bounded_http(mode):
    import httpx
    class LimitedStream(httpx.SyncByteStream):
        def __init__(self,stream): self.stream=stream
        def __iter__(self):
            count=0
            for chunk in self.stream:
                count+=len(chunk)
                if count>MAX_RESPONSE: raise RuntimeError('native_menu_outcome_unconfirmed')
                yield chunk
        def close(self): self.stream.close()
    class OneAttempt(httpx.BaseTransport):
        def __init__(self): self.inner=httpx.HTTPTransport(retries=0)
        def handle_request(self,request):
            _validate_wire(request.read(),mode)
            request.headers['accept-encoding']='identity'
            response=self.inner.handle_request(request)
            if response.headers.get('content-encoding','identity').lower() not in ('identity',''):
                response.close();raise RuntimeError('native_menu_outcome_unconfirmed')
            response.stream=LimitedStream(response.stream)
            return response
        def close(self): self.inner.close()
    # No SDK/transport retries, redirects, relay hooks or fallback chain.
    with httpx.Client(transport=OneAttempt(),timeout=90,follow_redirects=False) as client:
        yield client


def _sdk_request_once(operation):
    try: return operation()
    except Exception as error:
        # SDKs wrap transport failures. This exact cause proves our boundary
        # rejected the request before the underlying transport was called.
        if isinstance(error.__cause__,ValueError) and str(error.__cause__)=='native_menu_request_rejected':
            raise ValueError('native_menu_request_rejected') from None
        raise


def _single_native_call(req,kwargs):
    mode=req.resolved_api_mode
    if mode=='codex_responses':
        # Installed native Codex builder explicitly drops max_output_tokens.
        raise ValueError('native_menu_unbounded_provider')
    client=req.client
    if mode=='chat_completions':
        if getattr(client,'_real_client',client) is not client or type(client).__module__.split('.')[0]!='openai':
            raise ValueError('native_menu_request_rejected')
        if type(getattr(client,'max_retries',None)) is not int or client.max_retries!=0:
            raise ValueError('native_menu_request_rejected')
        _validate_wire(json.dumps(kwargs,ensure_ascii=False,allow_nan=False).encode(),mode)
        with _bounded_http(mode) as http:
            bounded=client.with_options(http_client=http,max_retries=0,timeout=90)
            return _sdk_request_once(lambda:bounded.chat.completions.create(**kwargs))
    if mode=='anthropic_messages':
        if type(client).__name__!='AnthropicAuxiliaryClient': raise ValueError('native_menu_request_rejected')
        inner=client._real_client
        if type(getattr(inner,'max_retries',None)) is not int or inner.max_retries!=0:
            raise ValueError('native_menu_request_rejected')
        from agent.anthropic_adapter import build_anthropic_kwargs
        from agent.transports import get_transport
        adapter=client.chat.completions
        native=build_anthropic_kwargs(model=kwargs['model'],messages=kwargs['messages'],tools=[],
            max_tokens=MAX_OUTPUT,reasoning_config=kwargs.get('_reasoning_config'),tool_choice='none',
            is_oauth=adapter._is_oauth,base_url=adapter._base_url)
        # Optional native extras are merged by the SDK; the wire guard rechecks them.
        extra=kwargs.get('extra_body') or {}
        extra={k:v for k,v in extra.items() if k not in {'reasoning','response_format'} and not str(k).startswith('_')}
        if extra: native['extra_body']=extra
        if kwargs.get('extra_headers'): native['extra_headers']=kwargs['extra_headers']
        native['stream']=False
        _validate_wire(json.dumps(native,ensure_ascii=False,allow_nan=False).encode(),mode)
        with _bounded_http(mode) as http:
            bounded=inner.with_options(http_client=http,max_retries=0,timeout=90)
            # Deliberately bypass create_anthropic_message's stream -> create fallback.
            response=_sdk_request_once(lambda:bounded.messages.create(**native))
        normalized=get_transport(mode).normalize_response(response,strip_tool_prefix=adapter._is_oauth)
        usage=getattr(response,'usage',None)
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason=normalized.finish_reason,
            message=SimpleNamespace(content=normalized.content,tool_calls=normalized.tool_calls))],usage=usage)
    if mode=='gemini_native':
        if type(client).__name__!='GeminiNativeClient': raise ValueError('native_menu_request_rejected')
        from agent.gemini_native_adapter import (build_gemini_request,bare_gemini_model_id,
            gemini_accepts_parameters_json_schema,translate_gemini_response)
        extra=kwargs.get('extra_body') or {}
        native=build_gemini_request(messages=kwargs['messages'],tools=[],tool_choice=None,
            max_tokens=MAX_OUTPUT,temperature=kwargs.get('temperature'),
            thinking_config=extra.get('thinking_config') or extra.get('thinkingConfig'),
            response_format=kwargs.get('response_format') or extra.get('response_format'),model=kwargs['model'],
            tools_as_json_schema=gemini_accepts_parameters_json_schema(client.base_url))
        # The Gemini builder can raise caps for thinking; reject after conversion.
        _validate_wire(json.dumps(native,ensure_ascii=False,allow_nan=False).encode(),mode)
        model=bare_gemini_model_id(kwargs['model'])
        with _bounded_http(mode) as http:
            response=http.post(f'{client.base_url}/models/{model}:generateContent',json=native,headers=client._headers())
            if response.status_code!=200: raise RuntimeError('native_menu_outcome_unconfirmed')
            payload=response.json()
        return translate_gemini_response(payload,model=model)
    raise ValueError('native_menu_request_rejected')


def _token_usage(usage,first,second):
    value=usage.get(first,usage.get(second)) if isinstance(usage,dict) else getattr(usage,first,getattr(usage,second,None))
    return value


def extract_native_once(document,selection,max_input_tokens):
    from bounded_menu_adapter import PROMPT
    from benefitsi_menu_service import validate_draft
    if (not isinstance(selection,dict) or set(selection)!={'provider','model'}
            or type(max_input_tokens) is not int or not 0<max_input_tokens<=10000000):
        raise ValueError('native_menu_request_rejected')
    messages=[{'role':'system','content':PROMPT},{'role':'user','content':json.dumps(document,ensure_ascii=False,allow_nan=False)}]
    with _prepared_request(selection,messages) as req:
        if (getattr(req,'request_provider',selection['provider'])!=selection['provider']
                or getattr(req,'resolved_provider',selection['provider'])!=selection['provider']):
            raise ValueError('native_menu_request_rejected')
        if req.resolved_api_mode not in {'chat_completions','anthropic_messages','codex_responses','gemini_native'} or req.final_model!=selection['model']:
            raise ValueError('native_menu_request_rejected')
        client=req.client
        # Native SDK factories use max_retries=0. Reject any explicit higher setting;
        # do not use call_llm, relay hooks, credit retry or the fallback ladder.
        if any(word in type(client).__name__.lower() for word in ('acp','claudecode','appserver','externalprocess','codexcli')):
            raise ValueError('native_menu_request_rejected')
        kwargs=dict(req.kwargs)
        extra=kwargs.get('extra_body')
        protected={'model','messages','input','system','prompt','tools','functions','tool_choice','function_call',
                   'web_search_options','max_tokens','max_output_tokens','max_completion_tokens','service_tier','mcp_servers'}
        def contains_controls(value):
            if isinstance(value,dict):
                return bool(protected.intersection(value)) or any(contains_controls(v) for v in value.values())
            return isinstance(value,list) and any(contains_controls(v) for v in value)
        if contains_controls(extra):
            raise ValueError('native_menu_request_rejected')
        if kwargs.get('tools') or kwargs.get('functions') or kwargs.get('tool_choice') not in (None,'none'):
            raise ValueError('native_menu_request_rejected')
        if kwargs.get('service_tier') not in (None,'default','standard'):
            raise ValueError('native_menu_request_rejected')
        kwargs['stream']=False
        caps=[kwargs[k] for k in ('max_tokens','max_output_tokens','max_completion_tokens') if k in kwargs]
        if not caps or any(type(n) is not int or not 0<n<=MAX_OUTPUT for n in caps):
            raise ValueError('native_menu_request_rejected')
        try:body=json.dumps(kwargs,ensure_ascii=False,allow_nan=False).encode()
        except (TypeError,ValueError):raise ValueError('native_menu_request_rejected') from None
        if len(body)>MAX_BODY:
            raise ValueError('native_menu_request_rejected')
        response=_single_native_call(req,kwargs)
    choices=getattr(response,'choices',None)
    if not isinstance(choices,list) or len(choices)!=1:
        raise ValueError('native_menu_invalid_response')
    choice=choices[0];message=getattr(choice,'message',None)
    content=getattr(message,'content',None)
    if (getattr(choice,'finish_reason',None)!='stop' or getattr(message,'tool_calls',None)
            or not isinstance(content,str) or len(content.encode())>MAX_RESPONSE):
        raise ValueError('native_menu_invalid_response')
    usage=getattr(response,'usage',None)
    input_tokens=_token_usage(usage,'prompt_tokens','input_tokens')
    output_tokens=_token_usage(usage,'completion_tokens','output_tokens')
    if (type(input_tokens) is not int or not 0<=input_tokens<=max_input_tokens
            or type(output_tokens) is not int or not 0<=output_tokens<=MAX_OUTPUT):
        raise ValueError('native_menu_invalid_response')
    try:return validate_draft(json.loads(content))
    except (TypeError,ValueError):raise ValueError('native_menu_invalid_response') from None


if __name__=='__main__':
    try:
        sys.path.insert(0,str(Path.home()/'.arc-m1-bridge'))
        raw=sys.stdin.buffer.read(MAX_RESPONSE+1)
        if len(raw)>MAX_RESPONSE:raise ValueError('native_menu_request_rejected')
        data=json.loads(raw)
        if set(data)!={'selection','document','maxInputTokens'}:raise ValueError('native_menu_request_rejected')
        with open(os.devnull,'w') as quiet,contextlib.redirect_stdout(quiet),contextlib.redirect_stderr(quiet):
            draft=extract_native_once(data['document'],data['selection'],data['maxInputTokens'])
        result={'draft':draft}
    except ValueError as error:
        code=str(error) if str(error) in {'native_menu_model_changed','native_menu_request_rejected','native_menu_invalid_response','native_menu_unbounded_provider'} else 'native_menu_invalid_response'
        result={'errorCode':code}
    except Exception:
        result={'errorCode':'native_menu_outcome_unconfirmed'}
    sys.stdout.write(json.dumps(result,ensure_ascii=False,allow_nan=False))

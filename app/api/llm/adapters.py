"""Vendor wire formats. The service's legacy envelope is private to this boundary.

An internal gateway can implement the OpenAI chat-completions API, or register a
custom adapter at startup. Neither changes the application-facing provider API.
"""
from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from typing import Callable, Protocol


@dataclass(frozen=True)
class ModelRequest:
    model: str
    system: str
    messages: list
    temperature: float
    max_output_tokens: int
    json_mode: bool = False
    schema: dict | None = None
    seed: int | None = None
    web_search: bool = False

    @classmethod
    def from_envelope(cls, model, body):
        gen = body.get('generationConfig') or {}
        system = '\n'.join(p.get('text', '') for p in (body.get('systemInstruction') or {}).get('parts', []))
        messages = []
        for content in body.get('contents', []):
            blocks = []
            for part in content.get('parts', []):
                if 'text' in part:
                    blocks.append({'type': 'text', 'text': part['text']})
                if 'inline_data' in part:
                    image = part['inline_data']
                    blocks.append({'type': 'image', 'mime_type': image['mime_type'], 'data': image['data']})
            messages.append({'role': 'assistant' if content['role'] == 'model' else 'user', 'content': blocks})
        return cls(model, system, messages, gen.get('temperature', .2), gen.get('maxOutputTokens', 8192),
                   gen.get('responseMimeType') == 'application/json', gen.get('responseSchema'),
                   gen.get('seed'), bool(body.get('tools')))


class ModelAdapter(Protocol):
    name: str
    def request(self, value: ModelRequest, *, stream: bool = False) -> urllib.request.Request: ...
    def response(self, value: dict) -> dict: ...
    def stream_chunk(self, value: dict) -> dict: ...


class GeminiAdapter:
    name = 'gemini'

    def __init__(self, settings):
        self.base = (settings.base_url or 'https://generativelanguage.googleapis.com/v1beta').rstrip('/')
        self.key = settings.api_key()

    def request(self, value, *, stream=False):
        contents = []
        for message in value.messages:
            parts = []
            for block in message['content']:
                parts.append({'text': block['text']} if block['type'] == 'text' else
                             {'inline_data': {'mime_type': block['mime_type'], 'data': block['data']}})
            contents.append({'role': 'model' if message['role'] == 'assistant' else 'user', 'parts': parts})
        gen = {'temperature': value.temperature, 'maxOutputTokens': value.max_output_tokens}
        if value.json_mode: gen['responseMimeType'] = 'application/json'
        if value.schema: gen['responseSchema'] = value.schema
        if value.seed is not None: gen['seed'] = value.seed
        body = {'contents': contents, 'generationConfig': gen}
        if value.system: body['systemInstruction'] = {'parts': [{'text': value.system}]}
        if value.web_search: body['tools'] = [{'google_search': {}}]
        method = 'streamGenerateContent?alt=sse' if stream else 'generateContent'
        return urllib.request.Request(f'{self.base}/models/{value.model}:{method}',
                                      data=json.dumps(body).encode('utf-8'), method='POST',
                                      headers={'content-type': 'application/json', 'x-goog-api-key': self.key})

    def response(self, value): return value
    def stream_chunk(self, value): return value


def json_schema(schema):
    """Legacy OpenAPI/Gemini schema -> standard JSON Schema without mutating callers."""
    if isinstance(schema, list): return [json_schema(v) for v in schema]
    if not isinstance(schema, dict): return schema
    out = {k: json_schema(v) for k, v in schema.items() if k not in ('nullable', 'propertyOrdering')}
    if isinstance(out.get('type'), str): out['type'] = out['type'].lower()
    if schema.get('nullable'):
        if isinstance(out.get('type'), str): out['type'] = [out['type'], 'null']
        else: out = {'anyOf': [out, {'type': 'null'}]}
    return out


class OpenAIAdapter:
    """Chat-completions-compatible internal models, including images and SSE.

    Web grounding is an optional capability: a gateway without it must report an
    explicit unsupported error instead of inventing search results.
    """
    name = 'openai'

    def __init__(self, settings):
        self.base, self.key = settings.base_url.rstrip('/'), settings.api_key()
        self.schema_mode = settings.schema_mode

    def request(self, value, *, stream=False):
        if value.web_search:
            from .provider import ProviderError
            raise ProviderError('unsupported_capability', '이 모델 연결은 실제 웹 검색을 지원하지 않습니다.')
        messages = []
        if value.system: messages.append({'role': 'system', 'content': value.system})
        for message in value.messages:
            blocks = [{'type': 'text', 'text': b['text']} if b['type'] == 'text' else
                      {'type': 'image_url', 'image_url': {'url': f"data:{b['mime_type']};base64,{b['data']}"}}
                      for b in message['content']]
            content = ''.join(b['text'] for b in blocks) if all(b['type'] == 'text' for b in blocks) else blocks
            messages.append({'role': message['role'], 'content': content})
        body = {'model': value.model, 'messages': messages, 'temperature': value.temperature,
                'max_tokens': value.max_output_tokens, 'stream': stream}
        if value.seed is not None: body['seed'] = value.seed
        if value.json_mode:
            schema = json_schema(value.schema) if value.schema else None
            # JSON object mode still receives the schema as a prompt constraint.
            # Gateways that support full JSON Schema can opt in explicitly.
            if schema and self.schema_mode == 'json_schema':
                body['response_format'] = {'type': 'json_schema', 'json_schema': {'name': 'response', 'schema': schema}}
            else:
                body['response_format'] = {'type': 'json_object'}
                instruction = 'Return one valid JSON value.' + (' Follow this JSON Schema: ' + json.dumps(schema, ensure_ascii=False) if schema else '')
                if messages and messages[0]['role'] == 'system':
                    messages[0]['content'] += '\n\n' + instruction
                else:
                    messages.insert(0, {'role': 'system', 'content': instruction})
        if stream: body['stream_options'] = {'include_usage': True}
        return urllib.request.Request(self.base + '/chat/completions', data=json.dumps(body).encode('utf-8'),
                                      method='POST', headers={'content-type': 'application/json', 'authorization': 'Bearer ' + self.key})

    def _normalize(self, value, stream):
        if value.get('error'):
            from .provider import ProviderError
            # Gateways can return an error event after the SSE connection opens.
            raise ProviderError('upstream_error', '모델 서버가 오류 응답을 보냈습니다.')
        choice = (value.get('choices') or [{}])[0]
        message = choice.get('delta' if stream else 'message') or {}
        text = message.get('content') or ''
        if isinstance(text, list): text = ''.join(p.get('text', '') for p in text if p.get('type') == 'text')
        finish = {'length': 'MAX_TOKENS', 'content_filter': 'SAFETY', 'stop': 'STOP'}.get(choice.get('finish_reason'), choice.get('finish_reason'))
        if message.get('refusal'): finish = 'SAFETY'
        result = {'candidates': [{'content': {'parts': [{'text': text}]}, 'finishReason': finish}]}
        usage = value.get('usage')
        if isinstance(usage, dict):
            metadata = {target: usage[source] for source, target in (
                ('prompt_tokens', 'promptTokenCount'), ('completion_tokens', 'candidatesTokenCount'),
                ('total_tokens', 'totalTokenCount')) if usage.get(source) is not None}
            for source, key, target in (
                    ('prompt_tokens_details', 'cached_tokens', 'cachedContentTokenCount'),
                    ('completion_tokens_details', 'reasoning_tokens', 'thoughtsTokenCount')):
                detail = usage.get(source) or {}
                if detail.get(key) is not None: metadata[target] = detail[key]
            result['usageMetadata'] = metadata
        return result

    def response(self, value): return self._normalize(value, False)
    def stream_chunk(self, value): return self._normalize(value, True)


class InternalAdapter(OpenAIAdapter):
    """Internal API boundary, initially using the existing chat-completions transport.

    Adapt request/response/stream handling here after reading the user-supplied
    API reference. The provider choice never falls back to Gemini.
    """
    name = 'internal'


_FACTORIES: dict[str, Callable] = {'internal': InternalAdapter, 'gemini': GeminiAdapter, 'openai': OpenAIAdapter}


def register_adapter(name: str, factory: Callable) -> None:
    """Register before server startup; all adapter HTTP requests use the same queue."""
    _FACTORIES[name] = factory


def create_adapter(settings) -> ModelAdapter:
    try:
        factory = _FACTORIES[settings.provider]
    except KeyError:
        from .provider import ProviderError
        raise ProviderError('bad_request', '등록되지 않은 AI 제공자입니다.') from None
    return factory(settings)

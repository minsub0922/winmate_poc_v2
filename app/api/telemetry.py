"""Optional operations hooks. No persistence or user database unless a local sink is installed."""
from __future__ import annotations
from contextlib import contextmanager
from contextvars import ContextVar, copy_context
from functools import wraps
import logging
import time
import traceback
import uuid

_context = ContextVar('winmate_trace', default={})
_sink = None
_dropped = 0
_capture = False
_health_extras = {}


def install(sink):
    global _sink
    previous, _sink = _sink, sink
    return previous


def enabled():
    return _sink is not None and not _context.get().get('ephemeral')


def capture_content(value):
    """Let installed sinks receive raw model request/response under ``content`` (the ops bridge strips it for the
    operations store). Returns the previous setting."""
    global _capture
    previous, _capture = _capture, bool(value)
    return previous


def content(request, response=None):
    """Keyword arguments for :func:`emit` carrying the raw model request/response, only when a sink asked for it."""
    if not _capture or not enabled():
        return {}
    return {'content': {'input': request, 'output': response}}


def register_health(name, fn):
    if fn is None:
        _health_extras.pop(name, None)
    else:
        _health_extras[name] = fn


def current():
    return dict(_context.get())


@contextmanager
def scope(**values):
    token = _context.set({**current(), **values})
    try:
        yield current()
    finally:
        _context.reset(token)


def emit(kind, **values):
    global _dropped
    if not enabled():
        return
    try:
        context=current()
        if 'span_id' not in values and kind not in ('http','llm.logical'):
            values={'span_id':uuid.uuid4().hex[:16],'parent_id':context.get('span_id'),**values}
        record = {**context, **values}
        if record.pop('content_private', False):
            record.pop('message', None)
            record.pop('stack', None)
        _sink(kind, record)
    except Exception:
        _dropped += 1
        if _dropped in (1, 10, 100):
            logging.getLogger('winmate.telemetry').warning('Operations records could not be persisted (%s)', _dropped)


def health():
    result = {'enabled': enabled(), 'dropped': _dropped}
    for name, fn in list(_health_extras.items()):
        try:
            result[name] = fn()
        except Exception:
            result[name] = {'error': True}
    return result


def stack(exc):
    return ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-18000:]


def generation(fn):
    @wraps(fn)
    def wrapped(self, *args, **kwargs):
        if not enabled():
            return fn(self, *args, **kwargs)
        started = time.time()
        context = current()
        stage = kwargs.get('stage', 'llm')
        with scope(trace_id=context.get('trace_id') or uuid.uuid4().hex,
                   parent_id=context.get('span_id'), span_id=uuid.uuid4().hex[:16],
                   stage=stage, feature=context.get('feature') or stage.split(':')[0]):
            emit('llm.logical',started=started,status='running',model=kwargs.get('model') or self.model)
            try:
                result = fn(self, *args, **kwargs)
                emit('llm.logical', started=started, ended=time.time(), status='cached' if result.cached else 'ok',
                     model=result.model, metadata={'attempts': result.attempts, 'cached': result.cached, 'schema_dropped': result.schema_dropped})
                return result
            except Exception as exc:
                emit('llm.logical', started=started, ended=time.time(), status='error', code=getattr(exc, 'code', type(exc).__name__),
                     message=str(exc), stack=stack(exc), model=kwargs.get('model', self.model))
                raise
    return wrapped


def network(fn):
    @wraps(fn)
    def wrapped(self, model, body, *args, **kwargs):
        if not enabled():
            return fn(self, model, body, *args, **kwargs)
        started = time.time()
        parent = current().get('span_id')
        span = uuid.uuid4().hex[:16]
        emit('llm.usage',span_id=span,parent_id=parent,started=started,status='running',model=model,usage=None)
        try:
            result = fn(self, model, body, *args, **kwargs)
            candidate = (result.get('candidates') or [{}])[0] or {}
            finish = candidate.get('finishReason')
            blocked = (result.get('promptFeedback') or {}).get('blockReason')
            failed = bool(blocked or finish in ('MAX_TOKENS', 'SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'))
            emit('llm.usage', span_id=span, parent_id=parent, started=started, ended=time.time(), model=model,
                 status='error' if failed else 'ok', code=blocked or (finish if failed else ''), usage=result.get('usageMetadata'),
                 metadata={'finish_reason': finish, 'transport': 'json', 'input_characters': sum(len(str(p.get('text', ''))) for c in body.get('contents', []) for p in c.get('parts', []))},
                 **content(body, result))
            return result
        except Exception as exc:
            emit('llm.usage', span_id=span, parent_id=parent, started=started, ended=time.time(), model=model,
                 status='error', code=getattr(exc, 'code', type(exc).__name__), message=str(exc), usage=None,
                 metadata={'transport': 'json', 'usage_unknown': True}, **content(body))
            raise
    return wrapped


def streaming(fn):
    @wraps(fn)
    def wrapped(self,*args,**kwargs):
        if not enabled():
            yield from fn(self,*args,**kwargs); return
        started=time.time(); parent=current();stage=kwargs.get('stage','llm'); execution=copy_context()
        def inner():
            with scope(trace_id=parent.get('trace_id') or uuid.uuid4().hex,parent_id=parent.get('span_id'),
                       span_id=uuid.uuid4().hex[:16],stage=stage,feature=parent.get('feature') or stage.split(':')[0]):
                emit('llm.logical',started=started,status='running',model=kwargs.get('model') or self.model,metadata={'stream':True})
                try:
                    yield from fn(self,*args,**kwargs)
                    emit('llm.logical',started=started,ended=time.time(),status='ok',model=kwargs.get('model') or self.model,metadata={'stream':True})
                except GeneratorExit:
                    emit('llm.logical',started=started,ended=time.time(),status='cancelled',code='stream_closed',model=kwargs.get('model') or self.model)
                    raise
                except Exception as exc:
                    emit('llm.logical',started=started,ended=time.time(),status='error',code=getattr(exc,'code',type(exc).__name__),
                         message=str(exc),stack=stack(exc),model=kwargs.get('model') or self.model)
                    raise
        iterator=inner()
        try:
            while True:
                try:value=execution.run(next,iterator)
                except StopIteration:return
                yield value
        finally:
            execution.run(iterator.close)
    return wrapped

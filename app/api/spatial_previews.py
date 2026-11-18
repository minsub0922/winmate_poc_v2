"""Server-rendered 3D 조감도 previews with a bounded Redis cache.

The browser used to draw every template/history card in WebGL (1600×1025 PNG data URLs, one scene at a time). The
server now renders them once with the editor's own renderer (``app/scripts/spatial_render_worker.mjs``) and serves
content-addressed WebP files:

  request → L1 cache (Redis, maxmemory ≤ 3gb, allkeys-lru; or the bounded memory LRU)
          → L2 file  app/data/runtime/spatial-previews/<library revision>/<scene digest>.webp
          → render   one worker process, N pages, interactive requests before background pre-rendering

The key is the library revision plus a digest of the canonical scene JSON computed here (never a client-supplied hash),
so a cached image can never belong to different content. URLs carry that identity, so browsers cache them as immutable.
Template previews for the current library revision are pre-rendered in the background after startup.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import itertools
import json
import logging
import math
import os
from pathlib import Path
import shutil
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Body, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from .runtime_env import ROOT, RUNTIME, env_values, flag, parse_int

log = logging.getLogger('winmate.spatial.previews')
WORKER = ROOT / 'app' / 'scripts' / 'spatial_render_worker.mjs'
VARIANT = 'w960'
WIDTH, HEIGHT, QUALITY = 960, 615, 86
IMMUTABLE = 'public, max-age=31536000, immutable'
PRIVATE_IMMUTABLE = 'private, max-age=31536000, immutable'


class RendererUnavailable(RuntimeError):
    """The server cannot render now. Clients fall back to their own WebGL renderer."""


@dataclass(frozen=True)
class RendererConfig:
    enabled: bool = True
    concurrency: int = 2
    timeout: int = 60
    prewarm: bool = True
    directory: Path = field(default_factory=lambda: RUNTIME / 'spatial-previews')
    node: str = ''
    log_file: Path = field(default_factory=lambda: RUNTIME / 'spatial-renderer.log')

    def public(self) -> dict:
        return {'enabled': self.enabled, 'concurrency': self.concurrency, 'timeout_s': self.timeout, 'prewarm': self.prewarm,
                'variant': VARIANT, 'size': [WIDTH, HEIGHT]}


def load_renderer_config(environ=None) -> RendererConfig:
    values = env_values(environ)
    directory = values.get('WINMATE_SPATIAL_PREVIEW_DIR', '').strip()
    return RendererConfig(
        enabled=flag(values.get('WINMATE_SPATIAL_RENDERER'), True),
        concurrency=parse_int(values.get('WINMATE_SPATIAL_RENDER_CONCURRENCY', ''), 2, 1, 8),
        timeout=parse_int(values.get('WINMATE_SPATIAL_RENDER_TIMEOUT', ''), 60, 5, 600),
        prewarm=flag(values.get('WINMATE_SPATIAL_PREWARM'), True),
        directory=Path(directory) if directory else RUNTIME / 'spatial-previews',
        node=values.get('WINMATE_NODE', '').strip() or shutil.which('node') or '')


def scene_digest(scene: Any) -> str:
    canonical = json.dumps(scene, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


class RendererProcess:
    """One Node worker. Requests are JSON lines; interactive work always goes before background pre-rendering."""

    def __init__(self, config: RendererConfig):
        self.config = config
        self.process: Optional[asyncio.subprocess.Process] = None
        self.pending: Dict[str, asyncio.Future] = {}
        self.ids = itertools.count(1)
        self.start_lock = asyncio.Lock()
        self.slots = asyncio.Semaphore(config.concurrency)
        self.interactive_waiting = 0
        self.idle = asyncio.Event(); self.idle.set()
        self.reader: Optional[asyncio.Task] = None
        self.failed_at = 0.0
        self.reason = ''
        self.stats = {'renders': 0, 'failures': 0, 'ms_total': 0, 'restarts': 0}
        self.log_handle = None

    @property
    def alive(self) -> bool:
        return self.process is not None and self.process.returncode is None

    async def start(self) -> None:
        async with self.start_lock:
            if self.alive:
                return
            if not self.config.enabled:
                raise RendererUnavailable('서버 조감도 렌더러가 꺼져 있습니다.')
            if time.monotonic() - self.failed_at < 30:
                raise RendererUnavailable(self.reason or '서버 조감도 렌더러를 다시 시작하는 중입니다.')
            if not self.config.node or not WORKER.is_file():
                self.failed_at, self.reason = time.monotonic(), 'Node.js 또는 렌더러 스크립트를 찾지 못했습니다.'
                raise RendererUnavailable(self.reason)
            self.config.log_file.parent.mkdir(parents=True, exist_ok=True)
            self.log_handle = open(self.config.log_file, 'ab')
            env = {**os.environ, 'WINMATE_SPATIAL_RENDER_CONCURRENCY': str(self.config.concurrency),
                   'WINMATE_SPATIAL_RENDER_TIMEOUT': str(self.config.timeout)}
            try:
                self.process = await asyncio.create_subprocess_exec(
                    self.config.node, str(WORKER), cwd=str(ROOT), env=env, limit=64 * 1024 * 1024,
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=self.log_handle)
                line = await asyncio.wait_for(self.process.stdout.readline(), timeout=90)
                ready = json.loads(line or b'{}')
                if not ready.get('ready'):
                    raise RuntimeError('worker did not report ready')
            except Exception as exc:
                await self._kill()
                self.failed_at, self.reason = time.monotonic(), f'서버 조감도 렌더러를 시작하지 못했습니다 ({type(exc).__name__}).'
                log.warning('spatial renderer: %s (log: %s)', self.reason, self.config.log_file)
                raise RendererUnavailable(self.reason) from None
            self.reason = ''
            self.stats['restarts'] += 1
            self.reader = asyncio.create_task(self._read())
            log.info('spatial renderer ready (%s pages)', ready.get('pages'))

    async def _read(self) -> None:
        process = self.process
        try:
            while process and process.stdout:
                line = await process.stdout.readline()
                if not line:
                    break
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                future = self.pending.pop(str(message.get('id')), None)
                if future and not future.done():
                    future.set_result(message)
        finally:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(RendererUnavailable('서버 조감도 렌더러가 종료되었습니다.'))
            self.pending.clear()
            self.failed_at, self.reason = time.monotonic(), '서버 조감도 렌더러가 종료되어 다시 시작합니다.'

    async def render(self, revision: str, scene: dict, *, background: bool = False) -> bytes:
        message = await self.execute(revision, {'scene': scene, 'width': WIDTH, 'height': HEIGHT, 'quality': QUALITY}, background=background)
        return base64.b64decode(message['webp'])

    async def snapshot(self, revision: str, scene: dict, options: dict) -> dict:
        return (await self.execute(revision, {'operation': 'snapshot', 'scene': scene, 'options': options}))['result']

    async def compute(self, revision: str, body: dict) -> dict:
        return (await self.execute(revision, {'operation': 'compute', 'input': body}))['result']

    async def building(self, revision: str, body: dict) -> dict:
        return (await self.execute(revision, {'operation': 'building', 'input': body}))['result']

    async def execute(self, revision: str, payload: dict, *, background: bool = False) -> dict:
        await self.start()
        if background:
            # Background pre-rendering waits while any interactive request is queued (the caller runs it serially).
            while self.interactive_waiting:
                self.idle.clear()
                await self.idle.wait()
            async with self.slots:
                return await self._send(revision, payload)
        self.interactive_waiting += 1
        try:
            await self.slots.acquire()
        finally:
            self.interactive_waiting -= 1
            if not self.interactive_waiting:
                self.idle.set()
        try:
            return await self._send(revision, payload)
        finally:
            self.slots.release()

    async def _send(self, revision: str, body: dict) -> dict:
        if not self.alive:
            await self.start()
        identifier = str(next(self.ids))
        future = asyncio.get_running_loop().create_future()
        self.pending[identifier] = future
        payload = json.dumps({**body, 'id': identifier, 'revision': revision},
                             ensure_ascii=False, allow_nan=False).encode() + b'\n'
        try:
            self.process.stdin.write(payload)
            await self.process.stdin.drain()
            message = await asyncio.wait_for(future, timeout=self.config.timeout + 15)
        except (asyncio.TimeoutError, ConnectionError, BrokenPipeError) as exc:
            self.pending.pop(identifier, None)
            self.stats['failures'] += 1
            raise RendererUnavailable('서버 조감도 렌더링 시간이 초과되었습니다.' if isinstance(exc, asyncio.TimeoutError) else '렌더러 연결이 끊어졌습니다.') from None
        if not message.get('ok'):
            self.stats['failures'] += 1
            if message.get('code') == 'invalid_input':
                raise ValueError(str(message.get('error', '공간 입력이 올바르지 않습니다.'))[:500])
            raise RendererUnavailable('서버에서 조감도를 렌더링하지 못했습니다: ' + str(message.get('error', ''))[:200])
        self.stats['renders'] += 1
        self.stats['ms_total'] += int(message.get('ms') or 0)
        return message

    async def _kill(self) -> None:
        if self.process and self.process.returncode is None:
            try:
                self.process.stdin.close()
                await asyncio.wait_for(self.process.wait(), timeout=5)
            except Exception:
                self.process.kill()
                await self.process.wait()
        self.process = None
        if self.log_handle:
            self.log_handle.close(); self.log_handle = None

    async def stop(self) -> None:
        if self.reader:
            self.reader.cancel()
        await self._kill()

    def status(self) -> dict:
        renders = self.stats['renders']
        return {'alive': self.alive, 'reason': self.reason or None, 'queue_interactive': self.interactive_waiting,
                'in_flight': len(self.pending), **self.stats, 'avg_ms': round(self.stats['ms_total'] / renders) if renders else None}


class SpatialPreviews:
    """Cache → file → render, with single-flight per key."""

    def __init__(self, library, cache, config: RendererConfig, renderer: Optional[RendererProcess] = None):
        self.library, self.cache, self.config = library, cache, config
        self.renderer = renderer or RendererProcess(config)
        self.inflight: Dict[str, asyncio.Future] = {}
        self.stats = {'cache_hits': 0, 'file_hits': 0, 'rendered': 0, 'unavailable': 0}
        self.prewarm_state = {'state': 'idle', 'done': 0, 'total': 0, 'revision': None}
        self.prewarm_task: Optional[asyncio.Task] = None

    def identity(self, scene: dict) -> Tuple[str, str]:
        revision = scene.get('assetRevision') or self.library.library['sourceHash']
        if not isinstance(revision, str) or len(revision) != 8 or not all(c in '0123456789abcdef' for c in revision):
            raise HTTPException(422, '오브젝트 버전이 올바르지 않습니다.')
        return revision, scene_digest(scene)

    def path(self, revision: str, digest: str) -> Path:
        return self.config.directory / revision / f'{digest}-{VARIANT}.webp'

    @staticmethod
    def cache_key(revision: str, digest: str) -> str:
        return f'spatial:{revision}:{digest}:{VARIANT}'

    def _read_file(self, file: Path) -> Optional[bytes]:
        try:
            return file.read_bytes()
        except OSError:
            return None

    def _write_file(self, file: Path, data: bytes) -> None:
        file.parent.mkdir(parents=True, exist_ok=True)
        temporary = file.with_suffix(f'.{os.getpid()}.{time.monotonic_ns()}.tmp')
        temporary.write_bytes(data)
        os.replace(temporary, file)

    async def image(self, scene: dict, *, background: bool = False) -> Tuple[bytes, str]:
        revision, digest = self.identity(scene)
        key = self.cache_key(revision, digest)
        data = await run_in_threadpool(self.cache.get, key)
        if data:
            self.stats['cache_hits'] += 1
            return data, digest
        file = self.path(revision, digest)
        data = await run_in_threadpool(self._read_file, file)
        if data:
            self.stats['file_hits'] += 1
            await run_in_threadpool(self.cache.set, key, data)
            return data, digest
        if key in self.inflight:
            return await asyncio.shield(self.inflight[key]), digest
        future = asyncio.get_running_loop().create_future()
        self.inflight[key] = future
        try:
            data = await self.renderer.render(revision, scene, background=background)
            await run_in_threadpool(self._write_file, file, data)
            await run_in_threadpool(self.cache.set, key, data)
            self.stats['rendered'] += 1
            future.set_result(data)
            return data, digest
        except BaseException as exc:
            if isinstance(exc, RendererUnavailable):
                self.stats['unavailable'] += 1
            future.set_exception(exc if isinstance(exc, Exception) else RendererUnavailable('취소되었습니다.'))
            future.exception()  # mark retrieved for followers that already left
            raise
        finally:
            self.inflight.pop(key, None)

    async def snapshot(self, scene: dict, options: dict) -> dict:
        revision, _ = self.identity(scene)
        return await self.cached_result(revision, {'scene': scene, 'options': options}, 'snapshot-v1', lambda: self.renderer.snapshot(revision, scene, options))

    async def building(self, body: dict) -> dict:
        revision = self.library.library['sourceHash']
        return await self.cached_result(revision, body, 'building-v1', lambda: self.renderer.building(revision, body))

    async def cached_result(self, revision, body, variant, render):
        digest = scene_digest(body)
        key = f'spatial:{revision}:{digest}:{variant}'
        file = self.config.directory / revision / f'{digest}-{variant}.json'
        data = await run_in_threadpool(self.cache.get, key)
        if not data:
            data = await run_in_threadpool(self._read_file, file)
        if data:
            return json.loads(data)
        if key in self.inflight:
            return await asyncio.shield(self.inflight[key])
        future = asyncio.get_running_loop().create_future()
        self.inflight[key] = future
        try:
            snapshot = await render()
            result = {'snapshot': snapshot, 'revision': revision, 'digest': digest}
            data = json.dumps(result, ensure_ascii=False, allow_nan=False).encode()
            await run_in_threadpool(self._write_file, file, data)
            await run_in_threadpool(self.cache.set, key, data)
            future.set_result(result)
            return result
        except BaseException as exc:
            future.set_exception(exc if isinstance(exc, Exception) else RendererUnavailable('취소되었습니다.'))
            future.exception()
            raise
        finally:
            self.inflight.pop(key, None)

    def template_scene(self, identifier: str) -> dict:
        scene = self.library.scenes.get(identifier)
        if scene is None:
            raise HTTPException(404, '공간 템플릿을 찾지 못했습니다.')
        return scene

    def start_prewarm(self) -> None:
        if self.config.enabled and self.config.prewarm and self.prewarm_task is None:
            self.prewarm_task = asyncio.create_task(self.prewarm())

    async def prewarm(self) -> None:
        revision = self.library.library['sourceHash']
        scenes = list(self.library.scenes.values())
        missing = [scene for scene in scenes if not self.path(*self.identity(scene)).is_file()]
        self.prewarm_state = {'state': 'running', 'done': len(scenes) - len(missing), 'total': len(scenes), 'revision': revision}
        try:
            await asyncio.sleep(5)  # leave startup and the first page loads alone
            for scene in missing:
                try:
                    await self.image(scene, background=True)
                except RendererUnavailable:
                    await asyncio.sleep(30)
                    continue
                self.prewarm_state['done'] += 1
            self.prewarm_state['state'] = 'done'
        except asyncio.CancelledError:
            self.prewarm_state['state'] = 'stopped'
            raise

    async def stop(self) -> None:
        if self.prewarm_task:
            self.prewarm_task.cancel()
            try:
                await self.prewarm_task
            except BaseException:
                pass
        await self.renderer.stop()

    def status(self) -> dict:
        return {'renderer': {**self.config.public(), **self.renderer.status()}, 'prewarm': dict(self.prewarm_state), **self.stats}


def _image_response(data: bytes, digest: str, request: Request, cache_control: str) -> Response:
    etag = f'"{digest}-{VARIANT}"'
    headers = {'Cache-Control': cache_control, 'ETag': etag, 'X-Content-Type-Options': 'nosniff'}
    if request.headers.get('if-none-match') == etag:
        return Response(status_code=304, headers=headers)
    return Response(data, media_type='image/webp', headers=headers)


def _unavailable(exc: RendererUnavailable) -> HTTPException:
    return HTTPException(503, {'code': 'renderer_unavailable', 'message': str(exc)})


def snapshot_options(value: Any) -> dict:
    if not isinstance(value, dict) or set(value) - {'w', 'h', 'type', 'quality', 'pixelRatio', 'transparentBackground', 'preview', 'camera'}:
        raise ValueError('캡처 설정이 올바르지 않습니다.')
    result = {'w': 1600, 'h': 1025, 'type': 'image/png', 'pixelRatio': 1, **value}
    for key, low, high in [('w', 160, 3200), ('h', 100, 2400), ('pixelRatio', 1, 2), ('quality', 0, 1)]:
        n = result.get(key, 1)
        if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or not low <= n <= high:
            raise ValueError('캡처 크기·품질이 올바르지 않습니다.')
    if result['w'] * result['h'] * result['pixelRatio'] ** 2 > 16_000_000:
        raise ValueError('캡처 크기가 너무 큽니다.')
    if result['type'] not in ('image/png', 'image/jpeg', 'image/webp'):
        raise ValueError('캡처 형식이 올바르지 않습니다.')
    for key in ('transparentBackground', 'preview'):
        if key in result and not isinstance(result[key], bool):
            raise ValueError('캡처 설정이 올바르지 않습니다.')
    return result


def build_router() -> APIRouter:
    router = APIRouter(prefix='/api/spatial', tags=['spatial-previews'])

    def inputs(request, body, scene=None):
        from .spatial import owner_for
        owner_for(request)
        if scene is not None and not isinstance(scene, dict):
            raise ValueError('장면 데이터가 올바르지 않습니다.')
        lib = request.app.state.spatial_library
        if len(json.dumps(body, ensure_ascii=False, allow_nan=False)) > 2_500_000:
            raise ValueError('공간 작업 데이터가 너무 큽니다.')
        revision = body.get('revision') or (scene or {}).get('assetRevision') or lib.library['sourceHash']
        lib.revision(revision)
        if scene and scene.get('assetRevision') and scene['assetRevision'] != revision:
            raise ValueError('장면과 오브젝트 버전이 일치하지 않습니다.')
        return lib, revision

    @router.post('/snapshot')
    async def snapshot(request: Request, body: dict = Body(...)):
        try:
            scene = body.get('scene')
            lib, revision = await run_in_threadpool(inputs, request, body, scene)
            options = snapshot_options(body.get('options', {}))
            frozen = {**scene, 'assetRevision': revision}
            if 'camera' in options:
                frozen['camera'] = options['camera']
            await run_in_threadpool(lib.validate, frozen)
            result = await request.app.state.spatial_previews.snapshot(frozen, options)
            return Response(json.dumps(result, ensure_ascii=False), media_type='application/json', headers={'Cache-Control': 'no-store'})
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(422, str(exc)) from None
        except RendererUnavailable as exc:
            raise _unavailable(exc) from None

    @router.post('/compute')
    async def compute(request: Request, body: dict = Body(...)):
        try:
            scene = body.get('scene') or (body.get('state') or {}).get('scene')
            lib, revision = await run_in_threadpool(inputs, request, body, scene)
            if body.get('kind') not in ('form', 'start', 'template', 'command', 'repair', 'selection', 'floor', 'room'):
                raise ValueError('지원하지 않는 공간 작업입니다.')
            if not isinstance(body.get('documentId', 'draft'), str) or len(body.get('documentId', '')) > 200:
                raise ValueError('문서 ID가 올바르지 않습니다.')
            if body['kind'] in ('form', 'start'):
                await run_in_threadpool(lib.validate_form, body.get('form'), revision)
            if scene:
                await run_in_threadpool(lib.validate, {**scene, 'assetRevision': revision})
            result = await request.app.state.spatial_previews.renderer.compute(revision, body)
            if result.get('scene'):
                await run_in_threadpool(lib.validate, result['scene'])
            return Response(json.dumps({**result, 'assetRevision': revision}, ensure_ascii=False, allow_nan=False), media_type='application/json', headers={'Cache-Control': 'no-store'})
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise HTTPException(422, str(exc)) from None
        except RendererUnavailable as exc:
            raise _unavailable(exc) from None

    @router.post('/building-snapshot')
    async def building_snapshot(request: Request, body: dict = Body(...)):
        from .spatial import owner_for
        owner_for(request)
        try:
            if len(json.dumps(body, ensure_ascii=False, allow_nan=False)) > 8_000_000:
                raise ValueError('건물 데이터가 너무 큽니다.')
            data, options = body['data'], body['options']
            if not isinstance(data, dict) or not isinstance(options, dict):
                raise ValueError('건물 데이터가 올바르지 않습니다.')
            if set(options) - {'floors', 'spread', 'w', 'h', 'single', 'title', 'type', 'quality', 'camera'}:
                raise ValueError('건물 캡처 설정이 올바르지 않습니다.')
            if 'camera' in options:
                camera = options['camera']
                if not isinstance(camera, dict) or set(camera) != {'azimuth', 'elevation', 'zoom'} or not all(
                        type(v) in (int, float) and math.isfinite(v) for v in camera.values()) or camera['zoom'] <= 0:
                    raise ValueError('건물 시점을 확인해 주세요.')
            size = snapshot_options({k: v for k, v in options.items() if k in ('w', 'h', 'type', 'quality')})
            options = {**options, **{k: v for k, v in size.items() if k != 'pixelRatio'}}
            floors = options.get('floors')
            if not isinstance(floors, list) or not 1 <= len(floors) <= 80:
                raise ValueError('층 목록이 올바르지 않습니다.')
            spread = options.get('spread', 0)
            if not isinstance(spread, (int, float)) or not 0 <= spread <= 1 or not isinstance(options.get('single', False), bool):
                raise ValueError('건물 보기 설정이 올바르지 않습니다.')
            if not isinstance(options.get('title', ''), str) or len(options.get('title', '')) > 500:
                raise ValueError('건물 제목이 올바르지 않습니다.')
            for key in ('tpl', 'assets', 'ind'):
                if not isinstance(data.get(key), list):
                    raise ValueError('건물 자산 데이터가 올바르지 않습니다.')
            if len(data['tpl']) > 80 or not isinstance(data.get('recipes'), dict) or not isinstance(data.get('styles'), dict):
                raise ValueError('건물 자산 데이터가 올바르지 않습니다.')
            ids = {t['id'] for t in data['tpl']}
            for floor in floors:
                identifier = floor if isinstance(floor, str) else floor.get('tpl')
                if identifier and identifier not in ids:
                    raise ValueError('건물에 사용한 층 데이터를 찾지 못했습니다.')
            result = await request.app.state.spatial_previews.building({'data': data, 'options': options})
            return Response(json.dumps(result, ensure_ascii=False, allow_nan=False), media_type='application/json', headers={'Cache-Control': 'no-store'})
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise HTTPException(422, str(exc)) from None
        except RendererUnavailable as exc:
            raise _unavailable(exc) from None

    @router.get('/templates/{identifier}/preview.webp')
    async def template_preview(identifier: str, request: Request, rev: str = '', managed: bool = False):
        previews: SpatialPreviews = request.app.state.spatial_previews
        current = previews.library.library['sourceHash']
        try:
            scene = request.app.state.spatial_store.template(identifier)['scene'] if managed or not rev else previews.template_scene(identifier)
            if rev and rev != current and (not managed or rev != scene['assetRevision']):
                raise HTTPException(404, '요청한 오브젝트 버전의 미리보기를 찾지 못했습니다.')
            data, digest = await previews.image(scene)
        except RendererUnavailable as exc:
            raise _unavailable(exc) from None
        # The revision in the URL makes the address content-specific; without it the address follows library rebuilds.
        return _image_response(data, digest, request, 'private, no-cache' if managed else IMMUTABLE if rev else 'public, max-age=300')

    @router.get('/history/{identifier}/preview.webp')
    async def history_preview(identifier: str, request: Request, v: str = ''):
        from .spatial import owner_for
        previews: SpatialPreviews = request.app.state.spatial_previews
        record = await run_in_threadpool(request.app.state.spatial_store.get, owner_for(request), identifier)
        if not record.get('scene'):
            raise HTTPException(404, '작성 중인 조감도에는 미리보기가 없습니다.')
        try:
            data, digest = await previews.image(record['scene'])
        except RendererUnavailable as exc:
            raise _unavailable(exc) from None
        # v= is the client's content hash: a new save changes the address, so the old one may be cached for good.
        return _image_response(data, digest, request, PRIVATE_IMMUTABLE if v == record['scene'].get('contentHash') else 'private, no-cache')

    @router.get('/previews/status')
    def preview_status(request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        return {'previews': request.app.state.spatial_previews.status(), 'cache': request.app.state.image_cache.status()}

    return router

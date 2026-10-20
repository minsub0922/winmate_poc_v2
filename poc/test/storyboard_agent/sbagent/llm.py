"""LLM 백엔드 — Gemini REST(generateContent, JSON 응답 스키마) · 기록 재생(replay).

poc/test/rfp_pipeline.py 의 GeminiBackend 와 같은 방식(표준 라이브러리 · 캐시 · 재시도 · 반복 폭주 감지).
같은 요청(모델 · 단계 · 프롬프트 · 온도 · seed)은 cache 에서 꺼내 다시 호출하지 않는다 → --backend replay 로 네트워크 없이 재현.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> dict:
    env: dict = {}
    for p in (ROOT / ".env", ROOT.parent / ".env", ROOT.parent.parent / ".env"):
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$", line)
                if m and not line.lstrip().startswith("#") and m.group(1) not in env:
                    env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    for k in ("GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_BASE_URL"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


class BackendError(RuntimeError):
    pass


@dataclass
class Call:
    stage: str
    ms: int
    prompt_tokens: int = 0
    output_tokens: int = 0
    cached: bool = False
    error: str = ""


def _key(model: str, stage: str, system: str, user: str, temperature: float, seed: int) -> str:
    raw = "\x00".join([model, stage, system, user, f"{temperature:.2f}", str(seed)])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def degenerate(text: str, unit: int = 40, times: int = 6) -> bool:
    if len(text) < unit * times:
        return False
    for i in range(0, len(text) - unit, max(1, len(text) // 50)):
        frag = text[i:i + unit]
        if frag.strip() and '"' not in frag and text.count(frag) >= times:
            return True
    return False


def parse_json(text: str) -> Any:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    try:
        return json.loads(text)
    except ValueError:
        a, b = text.find("{"), text.rfind("}")
        if a >= 0 and b > a:
            return json.loads(text[a:b + 1])
        raise


class Backend:
    name = "base"
    online = False

    def __init__(self) -> None:
        self.calls: list[Call] = []
        self._lock = threading.Lock()

    def complete(self, stage: str, system: str, user: str, *, schema: dict | None = None, temperature: float = 0.4,
                 seed: int = 0, max_tokens: int = 8192) -> dict:
        raise NotImplementedError

    def _log(self, c: Call) -> None:
        with self._lock:
            self.calls.append(c)


class OfflineBackend(Backend):
    """LLM 없음 — 에이전트는 규칙 설계로 대체한다."""
    name = "offline"


class GeminiBackend(Backend):
    name = "gemini"
    online = True
    DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, cache_dir: Path, env: dict | None = None, rpm: int = 120, timeout: int = 120, verbose: bool = False) -> None:
        super().__init__()
        env = env or load_env()
        self.key = env.get("GEMINI_API_KEY", "")
        if not self.key:
            raise BackendError("GEMINI_API_KEY 가 비어 있어요 (poc/.env)")
        self.model = env.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
        self.base = (env.get("GEMINI_BASE_URL") or self.DEFAULT_BASE).rstrip("/")
        self.cache_dir = cache_dir / self.model
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.min_gap = 60.0 / rpm if rpm else 0.0
        self.timeout, self.verbose = timeout, verbose
        self._last = 0.0
        self._rate = threading.Lock()

    def _post(self, body: dict) -> dict:
        req = urllib.request.Request(f"{self.base}/models/{self.model}:generateContent", data=json.dumps(body).encode("utf-8"), method="POST",
                                     headers={"content-type": "application/json", "x-goog-api-key": self.key})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    def complete(self, stage, system, user, *, schema=None, temperature=0.4, seed=0, max_tokens=8192):
        key = _key(self.model, stage, system, user, temperature, seed)
        f = self.cache_dir / f"{stage}-{key}.json"
        if f.exists():
            rec = json.loads(f.read_text(encoding="utf-8"))
            self._log(Call(stage, 0, rec.get("prompt_tokens", 0), rec.get("output_tokens", 0), cached=True))
            return rec["data"]
        gen = {"temperature": temperature, "responseMimeType": "application/json", "maxOutputTokens": max_tokens, "seed": seed}
        if schema:
            gen["responseSchema"] = schema
        body = {"contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": gen}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        t0, last, parse_fail = time.time(), "", 0
        for attempt in range(6):
            with self._rate:
                wait = self._last + self.min_gap - time.time()
                if wait > 0:
                    time.sleep(wait)
                self._last = time.time()
            try:
                res = self._post(body)
                cand = (res.get("candidates") or [{}])[0]
                text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []))
                if cand.get("finishReason") == "MAX_TOKENS" or degenerate(text):
                    last = "MAX_TOKENS" + (" · 반복 폭주" if degenerate(text) else "")
                    if gen["temperature"] < 0.85:
                        gen["temperature"] = 0.6 if gen["temperature"] < 0.5 else 0.9
                        continue
                    break
                if not text:
                    last = f"빈 응답(finishReason={cand.get('finishReason')})"
                    break
                try:
                    data = parse_json(text)
                except ValueError as e:
                    parse_fail += 1
                    last = f"JSON 해석 실패: {e}"
                    if parse_fail >= 2:
                        break
                    continue
                um = res.get("usageMetadata", {})
                rec = {"stage": stage, "model": self.model, "temperature": temperature, "seed": seed,
                       "prompt_tokens": um.get("promptTokenCount", 0), "output_tokens": um.get("candidatesTokenCount", 0), "data": data}
                f.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
                ms = int((time.time() - t0) * 1000)
                self._log(Call(stage, ms, rec["prompt_tokens"], rec["output_tokens"]))
                if self.verbose:
                    print(f"    · {stage:<10} {ms}ms in {rec['prompt_tokens']} / out {rec['output_tokens']}", flush=True)
                return data
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:400]
                last = f"HTTP {e.code}: {detail}"
                if e.code == 400 and "schema" in detail.lower() and "responseSchema" in gen:
                    gen.pop("responseSchema")
                    continue
                if e.code in (429, 500, 502, 503, 504):
                    time.sleep(min(60, 2 ** attempt * 3))
                    continue
                break
            except (urllib.error.URLError, TimeoutError, KeyError, IndexError, OSError) as e:
                last = f"{type(e).__name__}: {e}"
                time.sleep(min(20, 2 ** attempt))
        self._log(Call(stage, int((time.time() - t0) * 1000), error=last))
        raise BackendError(f"Gemini 호출 실패 ({stage}): {last}")


class ReplayBackend(Backend):
    name = "replay"
    online = True

    def __init__(self, cache_dir: Path, model: str | None = None) -> None:
        super().__init__()
        self.model = model or load_env().get("GEMINI_MODEL", "gemini-3.1-flash-lite")
        self.cache_dir = cache_dir / self.model

    def complete(self, stage, system, user, *, schema=None, temperature=0.4, seed=0, max_tokens=8192):
        f = self.cache_dir / f"{stage}-{_key(self.model, stage, system, user, temperature, seed)}.json"
        if not f.exists():
            raise BackendError(f"replay 캐시 없음: {f.name} — 먼저 --backend gemini 로 실행해 주세요")
        rec = json.loads(f.read_text(encoding="utf-8"))
        self._log(Call(stage, 0, rec.get("prompt_tokens", 0), rec.get("output_tokens", 0), cached=True))
        return rec["data"]


def make_backend(name: str, cache_dir: Path | None = None, **kw) -> Backend:
    cache_dir = cache_dir or ROOT / "cache"
    if name == "gemini":
        return GeminiBackend(cache_dir, **kw)
    if name == "replay":
        return ReplayBackend(cache_dir)
    return OfflineBackend()


def fence(s: str) -> str:
    """자료 블록 표시 — 안의 내용은 지시가 아니라 자료 (앱 ai.js 와 같은 표시)."""
    return f"<<<DATA\n{s}\nDATA>>>"

"""LLM 어댑터 — Gemini(langchain-google-genai) 또는 오프라인(결정론 규칙).

모든 LLM 노드는 `llm.structured(...)` 를 부르고, None 이 돌아오면 규칙 기반 결과를 쓴다
(앱의 ai.js 가 sample 실패 시 규칙 기반으로 대체하는 것과 같은 원칙).
호출 기록은 `llm.trace` 에 쌓여 리포트에 들어간다.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from . import config

T = TypeVar("T", bound=BaseModel)


class LLM:
    def __init__(self, mode: str | None = None, model: str | None = None, temperature: float = 0.2) -> None:
        mode = (mode or config.LLM_MODE).lower()
        if mode == "auto":
            mode = "gemini" if config.GEMINI_API_KEY else "offline"
        self.mode = mode
        self.model_name = model or config.GEMINI_MODEL
        self.temperature = temperature
        self.trace: list[dict] = []
        self._chat = None
        self.disabled_reason = ""
        if self.mode == "gemini":
            if not config.GEMINI_API_KEY:
                self.mode, self.disabled_reason = "offline", "GEMINI_API_KEY 없음"
            else:
                from langchain_google_genai import ChatGoogleGenerativeAI

                self._chat = ChatGoogleGenerativeAI(
                    model=self.model_name, api_key=config.GEMINI_API_KEY, temperature=temperature, max_retries=2, timeout=90,
                )

    @property
    def online(self) -> bool:
        return self.mode == "gemini" and self._chat is not None

    @property
    def chat_model(self):
        """deepagents 등 tool-calling 에이전트에 넘길 BaseChatModel."""
        return self._chat

    def structured(self, schema: type[T], system: str, user: str, *, tag: str) -> T | None:
        if not self.online:
            return None
        t0 = time.time()
        err = ""
        try:
            runnable = self._chat.with_structured_output(schema)
            out = runnable.invoke([("system", system), ("human", user)])
            if isinstance(out, schema):
                self._log(tag, True, t0)
                return out
            if isinstance(out, dict):
                v = schema.model_validate(out)
                self._log(tag, True, t0)
                return v
            err = f"unexpected type {type(out)}"
        except Exception as e:  # noqa: BLE001 — 실패하면 일반 호출 + JSON 추출로 한 번 더
            err = f"{type(e).__name__}: {str(e)[:200]}"
        try:
            raw = self._chat.invoke([("system", system + "\n\nJSON 객체 하나만 답하세요. 스키마:\n" + json.dumps(schema.model_json_schema(), ensure_ascii=False)), ("human", user)])
            text = raw.content if isinstance(raw.content, str) else "".join(c.get("text", "") for c in raw.content if isinstance(c, dict))
            v = schema.model_validate(_extract_json(text))
            self._log(tag, True, t0, note="fallback-json")
            return v
        except (ValidationError, ValueError, Exception) as e:  # noqa: BLE001
            self._log(tag, False, t0, err=err + " | " + f"{type(e).__name__}: {str(e)[:200]}")
            return None

    def _log(self, tag: str, ok: bool, t0: float, err: str = "", note: str = "") -> None:
        self.trace.append({"tag": tag, "ok": ok, "ms": int((time.time() - t0) * 1000), "err": err, "note": note, "model": self.model_name})


def _extract_json(text: str) -> Any:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError("JSON 없음")
    return json.loads(text[start:])


def fence(s: str) -> str:
    """프롬프트 인젝션 방지 — 자료 블록 표시 (앱 ai.js 와 동일)."""
    return f"<<<DATA\n{s}\nDATA>>>"

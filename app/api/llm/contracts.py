"""Stable, provider-independent application contract (including cumulative SSE)."""
from typing import Any, Callable, Iterator, Optional, Protocol, Sequence, runtime_checkable
from .provider import CancelCheck, GenerationResult, ProviderError


@runtime_checkable
class ModelProvider(Protocol):
    name: str
    model: str
    quick_model: str
    vision_model: str
    available: bool

    def model_for(self, tier: Optional[str]) -> str: ...
    def generate_json(self, *, stage: str, system: str = '', user: Optional[str] = None,
                      schema: Optional[dict] = None, temperature: float = .2,
                      max_output_tokens: int = 8192, seed: Optional[int] = None,
                      model: Optional[str] = None, turns: Optional[Sequence[Any]] = None,
                      images: Optional[Sequence[Any]] = None, cancel: CancelCheck = None,
                      max_attempts: int = 3, cache_allowed: bool = True) -> GenerationResult: ...
    def generate_text(self, *, stage: str, system: str = '', user: Optional[str] = None,
                      turns: Optional[Sequence[Any]] = None, temperature: float = .4,
                      max_output_tokens: int = 8192, json_mode: bool = False,
                      model: Optional[str] = None, images: Optional[Sequence[Any]] = None,
                      cancel: CancelCheck = None, max_attempts: int = 3) -> GenerationResult: ...
    def stream_text(self, *, stage: str, system: str = '', user: Optional[str] = None,
                    turns: Optional[Sequence[Any]] = None, temperature: float = .4,
                    max_output_tokens: int = 8192, json_mode: bool = False,
                    model: Optional[str] = None, images: Optional[Sequence[Any]] = None,
                    cancel: CancelCheck = None, max_attempts: int = 3,
                    schema: Optional[dict] = None, on_result: Optional[Callable] = None) -> Iterator[str]: ...
    def search_web(self, *, stage: str, query: str, cancel: CancelCheck = None) -> GenerationResult: ...
    def structured(self, schema_cls: Any, system: str, user: str, *, stage: str,
                   temperature: float = .2, max_output_tokens: int = 8192,
                   cancel: CancelCheck = None) -> Any: ...
    def chat_model(self, temperature: float = .2) -> Any: ...

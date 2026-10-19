# app/api/poc — strict real-only contracts

The runtime has **one** mode: every AI task runs against the server Gemini provider (`provider.GeminiProvider`).
There is no dummy mode, no per-function switch, no `offline`/`llm:false` request override and no rule result
substituted for a failed model step. Deterministic PoC algorithms (chunking, grounding/guards, metadata, BM25 +
TF-IDF retrieval, planning, layout geometry, `resolve/check/fix` validation, catalog/DB lookups) still run —
they are real algorithms, not fallbacks.

## Startup

- `initialize(warm=True, require_provider=True)` raises `PocStartupError(code='no_api_key')` when
  `get_provider()` returns no provider. `main.py` lifespan calls it with defaults → the server fails to start
  without a key (start-script preflight). Tests can install a provider with
  `provider.set_provider_override(fake)` or call `initialize(require_provider=False)`.
- Legacy `WINMATE_MODE` / `WINMATE_<FUNC>_MODE` values other than `real` are **ignored** and listed in
  `settings.legacy_ignored` + `settings.warnings` (also logged at startup).

## Settings shape (read-only compatibility)

`capabilities().settings`: `mode:'real'`, `function_mode:'always_real'`, `functions:{<f>:'real'}` for
`FUNCTIONS = rfp · layout · search · rerank · review · storyboard · part · fill · simulation · llm`,
`api_key_configured`, `legacy_ignored`, `warnings`, model / endpoint host / timeout / rpm (no secrets).

## Capabilities

`functions[f] = {mode:'real', effective:'llm'|'unavailable', ready, needs_kb, needs_provider:true, engine,
unavailable_reason, provider_reason, import_error, offline_override:false, rule_fallback:false}` —
`effective` is `unavailable` when Gemini is unavailable (no `rules`). `provider = {name, available, reason,
model, quick_model, usage}`. `policy` describes the strict rules. `search_cache` exposes cache stats.

## Request validation (all endpoints)

| request | response |
|---|---|
| `offline` present and not `false`/`null` | 422 `unsupported_option` |
| `llm` present and not `true`/`null` | 422 `unsupported_option` |
| `mode` other than `'real'` (except storyboard job `mode: continue|redesign`) | 422 `unsupported_option` |
| no Gemini provider | 503 `no_api_key` (before any job is created) |

Error body: `{detail, message, code, error, mode:'real', step?, retryable?, provider_code?, reason?}`.

## Model failure policy

Provider transport retries/backoff/rpm are owned by `provider.py`. After they are exhausted the adapter raises
`jobs.ModelFailure` (not a PoC `BackendError`, `ValueError`, `KeyError` or `TypeError`, so original PoC
`except` blocks cannot swallow it).

| code | sync HTTP | retryable |
|---|---|---|
| `no_api_key` · `provider_disabled` · `auth_failed` · `model_not_found` | 503 | no |
| `rate_limited` | 429 | yes |
| `upstream_unavailable` | 503 | yes |
| `network` | 504 | yes |
| `blocked` · `bad_request` | 422 | no |
| `max_tokens` · `invalid_json` · `schema_rejected` · `empty` · `invalid_output` · `incomplete_output` · `no_model_call` · `http_error` · `upstream_error` | 502 | yes |

Jobs: `status:'error'`, `error = {code, message, step, retryable, provider_code, detail}`, `llm` = call
counts so far (`effective:'error'`). Never `status:'done'` with a rule result. Cancellation (`POST
/api/jobs/{id}/cancel`, provider `cancel` hook, `check_cancel` between steps) still ends in `cancelled`.

## `llm` block (every successful result)

`{requested:'real', effective:'llm', strict:true, provider:'gemini', model, llm_used:true, calls_ok,
calls_failed, calls_rejected, cached, tokens:{prompt, output}, steps:{<step>: n}, fallbacks:[], errors, issues}`.
`calls_ok` counts real successful provider calls; `calls_failed`/`calls_rejected` count attempts that were
re-asked and recovered (or the one that failed the job).

## Per feature

- **RFP** (`kind:'rfp'`): `AppRfpBackend` — profile · extract · gapfill · consolidate all on Gemini; no
  `RulesBackend`. A failed stage raises `ModelFailure` (so `run_pipeline`'s rule consolidation is unreachable);
  the adapter also rejects any `stats.consolidate_fallback` and requires `steps['rfp:profile']` (and
  `rfp:consolidate` when forms exist).
- **Layout** (`kind:'layout'`): `AppLayoutLLM.structured()` = structured output → one plain-JSON re-ask
  (PoC sequence, both real model calls) → **raise** (never `None`). Non-recoverable provider codes skip the
  re-ask. On completion `analysis.llm` must be `true` and `calls_ok > 0`. Interrupt/answer/resume unchanged.
  `llm` adds `nodes_ok`, `nodes_failed`, `json_reask_ok`.
- **Review** (`kind:'review'`): `AppScoreBackend` validates outputs before the PoC parses them — route
  L1/L2 (`communities[].relevance`, `criteria[].priority` int-able) and score (every requested criterion id
  with score 1–3, evidence sheets int-able) — with one re-ask, then `invalid_output`/`incomplete_output`.
  Afterwards `route.mode == 'llm'` and every `scores[].mode == 'llm'` are required, plus `route_l1`/`route_l2`
  calls in `steps`.
- **Storyboard** (`kind:'storyboard'`): design and repair calls must succeed; `out.llm` must be `true` and
  `steps['storyboard:design']` present. PoC `resolve/check/fix` validation still runs on the model draft.
- **Search** (`POST /api/layouts/search`, feature `rerank`): BM25 + TF-IDF + PoC metadata retrieval
  (`rank_slide`, `top=max(k,20)`) → top 20 minimal cards (`f, code, name, part, when≤80, visual≤3, needs≤4,
  rule`) to Gemini (`model_tier` quick) with `responseSchema` enum = candidate ids. Required answer
  `{order:[{f, why}]}`: non-empty, whitelisted, unique (one re-ask, then 502 `invalid_output`). Unlisted pool
  candidates follow in retrieval order, then the retrieval tail up to `k`. A whole-query exact layout
  `code`/`f` match is pinned first (`pinned:true`, why `코드 일치`). `score` is monotonic with the final order
  (reranked block above every retrieval score); `retrieval_score`, `rank`, `reranked`, `why` (`Gemini · …`
  first) are added; `name`, `when`, `part`, … unchanged. Response: `{mode:'real', engine:'bm25+tfidf+gemini',
  items, query, counts, rerank:{model, pool, ordered, pinned, retrieval_ms, rerank_ms, calls_ok,
  calls_rejected, tokens, cache:'miss'|'hit'|'coalesced'}, llm, unknown_ids, ms}`. No candidates → `items:[]`,
  no model call, `llm.effective:'none'`, `llm.reason:'no_candidates'`. Identical requests: in-process TTL
  cache (600 s, 256 entries, server-side sha256 key incl. model + KB `generated_at`; errors never cached) and
  in-flight coalescing (waiters share the leader's result or error).
- **Generic `/api/llm`**: `feature` required (one of `FUNCTIONS`); `kind:'json'|'text'`; optional `schema`
  (Gemini OpenAPI subset: `type, properties, items, required, enum, description, nullable, format, minItems,
  maxItems, propertyOrdering`; ≤30,000 chars; `kind:'json'` only) → `responseSchema` via
  `GeminiProvider.generate_json`, and the answer is validated server-side (one re-ask non-streamed).
  JSON: `{mode:'real', feature, data|text, model, usage, schema_validated?}`; failures are HTTP errors.
  SSE: the first upstream chunk is read before the stream opens (start failures → HTTP error); then
  cumulative `{type:'text'}` frames and `{type:'result', mode:'real', feature, data|text, model}` or
  `{type:'error', code, message, retryable}` (mid-stream failure, invalid JSON, schema mismatch). The stream
  passes `schema` to `provider.stream_text` as well; the final text is validated against it (no re-ask once
  frames were sent). `response_schema` is accepted as an alias of `schema` (422 if both differ).

## Files changed for the strict runtime

`settings.py` · `jobs.py` (`ModelFailure`) · `strict.py` (new) · `backends.py` · `service.py` · `routes.py` ·
`knowledge.py` (note text) · `__init__.py` · `adapters/{common,rfp,layout,review,storyboard,search,llm}.py` ·
`NOTES.md` · this file. `provider.py` is owned by the parent (unchanged). `main.py` unchanged (its lifespan
`initialize_poc()` now fails fast without a provider). Original `poc/`, `src/`, `dist/`, `proddb/`,
`reference/` untouched.

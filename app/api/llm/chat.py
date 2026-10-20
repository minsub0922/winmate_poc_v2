"""LangChain compatibility through the queue, without a second network client."""


def queued_chat_model(provider, temperature):
    from langchain_core.language_models.chat_models import BaseChatModel
    from langchain_core.messages import AIMessage, AIMessageChunk
    from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
    from langchain_core.runnables import RunnableLambda
    from .provider import ProviderError, gemini_schema_from_model

    class QueuedChat(BaseChatModel):
        model_provider: object
        temperature: float = .2

        @property
        def _llm_type(self): return 'winmate-queued'

        @property
        def _identifying_params(self): return {'model': self.model_provider.model}

        def _turns(self, messages):
            turns = []
            for message in messages:
                if message.type not in ('system', 'human', 'ai') or getattr(message, 'tool_calls', None):
                    raise ProviderError('unsupported_capability', '이 모델 연결은 도구 호출 대화를 지원하지 않습니다.')
                turns.append({'role': {'human': 'user', 'ai': 'assistant'}.get(message.type, message.type), 'content': message.content})
            return turns

        def _generate(self, messages, stop=None, run_manager=None, **kwargs):
            result = self.model_provider.generate_text(stage='chat:invoke', turns=self._turns(messages), temperature=self.temperature)
            text = result.text
            if stop:
                text = text[:min((text.find(s) for s in stop if s and s in text), default=len(text))]
            message = AIMessage(content=text, usage_metadata={'input_tokens': result.prompt_tokens,
                                'output_tokens': result.output_tokens, 'total_tokens': result.prompt_tokens + result.output_tokens})
            return ChatResult(generations=[ChatGeneration(message=message)], llm_output={'model': result.model})

        def _stream(self, messages, stop=None, run_manager=None, **kwargs):
            emitted, text = 0, ''
            stops = [s for s in (stop or []) if s]
            withheld = max((len(s) - 1 for s in stops), default=0)
            iterator = self.model_provider.stream_text(stage='chat:stream', turns=self._turns(messages), temperature=self.temperature)
            try:
                for text in iterator:
                    index = min((text.find(s) for s in stops if s in text), default=None)
                    end = index if index is not None else max(emitted, len(text) - withheld)
                    if end > emitted:
                        yield ChatGenerationChunk(message=AIMessageChunk(content=text[emitted:end]))
                        emitted = end
                    if index is not None: return
                if len(text) > emitted:
                    yield ChatGenerationChunk(message=AIMessageChunk(content=text[emitted:]))
            finally:
                iterator.close()

        def with_structured_output(self, schema, *, include_raw=False, **kwargs):
            def invoke(value):
                messages = self._convert_input(value).to_messages()
                model_schema = gemini_schema_from_model(schema) if hasattr(schema, 'model_json_schema') else schema
                result = self.model_provider.generate_json(stage='chat:structured', turns=self._turns(messages),
                                                          schema=model_schema, temperature=self.temperature)
                raw = AIMessage(content=result.text)
                try:
                    parsed = schema.model_validate(result.data) if hasattr(schema, 'model_validate') else result.data
                except Exception as exc:
                    if include_raw: return {'raw': raw, 'parsed': None, 'parsing_error': exc}
                    raise
                return {'raw': raw, 'parsed': parsed, 'parsing_error': None} if include_raw else parsed
            return RunnableLambda(invoke)

        def bind_tools(self, tools, **kwargs):
            raise ProviderError('unsupported_capability', '이 모델 연결은 도구 호출을 지원하지 않습니다.')

    return QueuedChat(model_provider=provider, temperature=temperature)

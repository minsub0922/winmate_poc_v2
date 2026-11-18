"""Request-local layout overrides. Never mutate the shared composer or registries."""
from contextlib import contextmanager
from contextvars import ContextVar

_snapshot = ContextVar('layout_experiment_snapshot', default=None)


def current():
    return _snapshot.get()


@contextmanager
def use(value):
    token = _snapshot.set(value)
    try:
        yield
    finally:
        _snapshot.reset(token)

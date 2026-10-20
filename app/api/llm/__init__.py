"""Shared model API. Applications use get_provider; vendors implement adapters."""


def get_provider(settings):
    # The legacy module owns the singleton and test overrides for compatibility.
    from ..poc.provider import get_provider as resolve
    return resolve(settings)

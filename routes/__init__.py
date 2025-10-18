"""Shared helpers for route blueprints."""

from __future__ import annotations

from urllib.parse import urlparse

from flask import redirect, request, url_for

__all__ = ["safe_redirect"]


def safe_redirect(referrer: str | None, fallback_endpoint: str, **values):
    """Redirect to referrer when it matches the current host, otherwise fallback."""
    if not referrer:
        return redirect(url_for(fallback_endpoint, **values))
    ref_url = urlparse(request.host_url)
    test_url = urlparse(referrer)
    if test_url.scheme in ("http", "https") and ref_url.netloc == test_url.netloc:
        return redirect(referrer)
    return redirect(url_for(fallback_endpoint, **values))

"""Shared helpers for route blueprints."""

from __future__ import annotations

from urllib.parse import urlparse

from flask import redirect, request, url_for
from flask_wtf.csrf import validate_csrf
from wtforms.validators import ValidationError

__all__ = ["safe_redirect", "validate_request_csrf"]


def safe_redirect(referrer: str | None, fallback_endpoint: str, **values):
    """Redirect to referrer when it matches the current host, otherwise fallback."""
    if not referrer:
        return redirect(url_for(fallback_endpoint, **values))
    ref_url = urlparse(request.host_url)
    test_url = urlparse(referrer)
    if test_url.scheme in ("http", "https") and ref_url.netloc == test_url.netloc:
        return redirect(referrer)
    return redirect(url_for(fallback_endpoint, **values))


def validate_request_csrf(token: str | None) -> tuple[bool, str | None]:
    """Validate CSRF tokens supplied with JSON payloads."""
    if not token:
        return False, "The CSRF token is missing."
    try:
        validate_csrf(token)
    except ValidationError:
        return (
            False,
            "The CSRF token is invalid or has expired. Please refresh and try again.",
        )
    except Exception:
        return False, "The CSRF token is invalid."
    return True, None

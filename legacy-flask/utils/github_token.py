"""
utils/github_token.py
GitHub App token management with auto-refresh caching.
"""

import os
import time
from github import GithubIntegration
from github.GithubException import GithubException
from flask import current_app

# In-memory token cache (shared across requests)
_token_cache = {"token": None, "expires_at": 0}


def _generate_new_token():
    """Generate a fresh GitHub App installation token."""
    private_key_path = (os.getenv("GITHUB_PRIVATE_KEY_PATH") or "").strip()
    app_id_raw = (os.getenv("GITHUB_APP_ID") or "").strip()
    installation_id_raw = (os.getenv("GITHUB_INSTALLATION_ID") or "").strip()

    if not private_key_path or not app_id_raw or not installation_id_raw:
        raise RuntimeError(
            "Missing required GitHub App environment variables: "
            "GITHUB_PRIVATE_KEY_PATH, GITHUB_APP_ID, GITHUB_INSTALLATION_ID"
        )

    if not os.path.exists(private_key_path):
        raise RuntimeError(
            f"GitHub App private key file not found at '{private_key_path}'. "
            "Update GITHUB_PRIVATE_KEY_PATH to point to a readable .pem file."
        )

    try:
        app_id = int(app_id_raw)
    except ValueError as exc:  # pragma: no cover - configuration error
        raise RuntimeError(
            "GITHUB_APP_ID must be a numeric GitHub App id."
        ) from exc

    try:
        installation_id = int(installation_id_raw)
    except ValueError as exc:  # pragma: no cover - configuration error
        raise RuntimeError(
            "GITHUB_INSTALLATION_ID must be the numeric installation id."
        ) from exc

    with open(private_key_path, "r") as key_file:
        private_key = key_file.read()

    gi = GithubIntegration(app_id, private_key)

    try:
        token_data = gi.get_access_token(installation_id)
    except GithubException as exc:
        if current_app:
            current_app.logger.error(
                "GitHub rejected installation token request (status %s): %s",
                getattr(exc, "status", "unknown"),
                getattr(exc, "data", {}),
            )
        raise RuntimeError(
            "Unable to generate GitHub App installation token. "
            "Verify that the app is installed on the target account and that the installation id is correct."
        ) from exc

    _token_cache["token"] = token_data.token
    _token_cache["expires_at"] = token_data.expires_at.timestamp()

    if current_app:
        current_app.logger.info("Generated new GitHub App token (valid for 1 hour).")

    return token_data.token


def get_github_token():
    """
    Returns a valid GitHub App installation token.
    Refreshes automatically if expired or missing.
    """
    # If token exists and valid for at least 60 seconds more, reuse it
    if (
        _token_cache["token"]
        and time.time() < _token_cache["expires_at"] - 60
    ):
        return _token_cache["token"]

    return _generate_new_token()

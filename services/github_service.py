"""Utilities for interacting with the GitHub API."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib import request as urllib_request, error as urllib_error
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

GITHUB_API_BASE = "https://api.github.com"
GITHUB_APP_LABEL = "ProjectsManager"
MISSING_ISSUE_STATUS_CODES = {404, 410}


class GitHubError(RuntimeError):
    """Raised when a GitHub API call fails."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class GitHubRepository:
    """Simple representation of a GitHub repository."""

    id: int
    name: str
    owner: str


@dataclass
class GitHubIssue:
    """Simplified issue payload returned from GitHub."""

    id: int
    number: int
    title: str
    body: str
    url: str
    state: str
    labels: List[str]


def _get_fernet() -> Fernet:
    secret_key = current_app.config.get("SECRET_KEY")
    if not secret_key:
        raise RuntimeError("SECRET_KEY is required to encrypt GitHub tokens")
    if isinstance(secret_key, str):
        secret_bytes = secret_key.encode("utf-8")
    else:
        secret_bytes = secret_key
    digest = hashlib.sha256(secret_bytes).digest()
    encoded_key = base64.urlsafe_b64encode(digest)
    return Fernet(encoded_key)


def encrypt_token(token: str) -> bytes:
    if not token:
        raise ValueError("Token must not be empty")
    fernet = _get_fernet()
    return fernet.encrypt(token.encode("utf-8"))


def decrypt_token(token_encrypted: Optional[bytes]) -> Optional[str]:
    if not token_encrypted:
        return None
    fernet = _get_fernet()
    try:
        return fernet.decrypt(token_encrypted).decode("utf-8")
    except InvalidToken as exc:  # pragma: no cover - shouldn't happen unless SECRET_KEY rotated
        logging.error("Unable to decrypt GitHub token: %s", exc)
        return None


def _headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "ProjectsManager-Integration",
        "Content-Type": "application/json",
    }


def _request(method: str, endpoint: str, token: str, payload: Optional[dict] = None) -> Tuple[int, Any]:
    url = endpoint if endpoint.startswith("http") else f"{GITHUB_API_BASE}{endpoint}"
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib_request.Request(url, data=data, headers=_headers(token), method=method)
    try:
        with urllib_request.urlopen(request, timeout=20) as response:
            status = response.getcode()
            raw = response.read()
    except urllib_error.HTTPError as error:
        status = error.code
        raw = error.read()
    except urllib_error.URLError as error:
        raise GitHubError("Unable to reach GitHub.") from error

    text = raw.decode("utf-8") if raw else ""
    if status >= 400:
        logging.warning(
            "GitHub API call failed",
            extra={"method": method, "url": url, "status": status, "body": text[:500]},
        )
    try:
        body = json.loads(text) if text else {}
    except json.JSONDecodeError:
        body = {}
    return status, body


def test_connection(token: str) -> bool:
    status, _ = _request("GET", "/user", token)
    return 200 <= status < 300


def list_repositories(token: str) -> List[GitHubRepository]:
    repos: List[GitHubRepository] = []
    page = 1
    while True:
        status, payload = _request("GET", f"/user/repos?per_page=100&page={page}", token)
        if status == 401:
            raise GitHubError("Unauthorized", status)
        if status >= 400:
            raise GitHubError("Unable to list repositories", status)
        if not payload:
            break
        for repo in payload:
            owner = repo.get("owner", {}).get("login")
            repos.append(GitHubRepository(id=repo["id"], name=repo["name"], owner=owner))
        page += 1
    return repos


def _ensure_label(token: str, owner: str, repo: str, label: str) -> None:
    endpoint = f"/repos/{owner}/{repo}/labels/{quote(label)}"
    status, _ = _request("GET", endpoint, token)
    if status == 404:
        create = _request(
            "POST",
            f"/repos/{owner}/{repo}/labels",
            token,
            payload={"name": label, "color": "0f6fff"},
        )
        create_status, _ = create
        if create_status not in (200, 201, 202, 204, 422):
            raise GitHubError(f"Unable to create label '{label}'", create_status)


def ensure_labels(token: str, owner: str, repo: str, labels: Iterable[str]) -> None:
    for label in {label.strip() for label in labels if label}:
        _ensure_label(token, owner, repo, label)


def create_issue(token: str, owner: str, repo: str, title: str, body: str, labels: Iterable[str]) -> GitHubIssue:
    all_labels = set(labels)
    all_labels.add(GITHUB_APP_LABEL)
    ensure_labels(token, owner, repo, all_labels)

    status, payload = _request(
        "POST",
        f"/repos/{owner}/{repo}/issues",
        token,
        payload={"title": title, "body": body, "labels": sorted(all_labels)},
    )
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status == 404:
        raise GitHubError("Repository not found", status)
    if status >= 400:
        raise GitHubError("Unable to create issue", status)
    return GitHubIssue(
        id=payload["id"],
        number=payload["number"],
        title=payload.get("title", ""),
        body=payload.get("body", ""),
        url=payload.get("html_url", ""),
        state=payload.get("state", "open"),
        labels=[label.get("name") for label in payload.get("labels", [])],
    )


def fetch_issue(token: str, owner: str, repo: str, issue_number: int) -> GitHubIssue:
    status, payload = _request("GET", f"/repos/{owner}/{repo}/issues/{issue_number}", token)
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("Unable to fetch issue", status)
    return GitHubIssue(
        id=payload["id"],
        number=payload["number"],
        title=payload.get("title", ""),
        body=payload.get("body", ""),
        url=payload.get("html_url", ""),
        state=payload.get("state", "open"),
        labels=[label.get("name") for label in payload.get("labels", [])],
    )


def update_issue(token: str, owner: str, repo: str, issue_number: int, *, title: Optional[str] = None, body: Optional[str] = None, labels: Optional[Iterable[str]] = None, state: Optional[str] = None) -> GitHubIssue:
    payload: Dict[str, object] = {}
    if title is not None:
        payload["title"] = title
    if body is not None:
        payload["body"] = body
    if labels is not None:
        combined_labels = set(labels)
        combined_labels.add(GITHUB_APP_LABEL)
        ensure_labels(token, owner, repo, combined_labels)
        payload["labels"] = sorted(combined_labels)
    if state is not None:
        payload["state"] = state

    status, data = _request("PATCH", f"/repos/{owner}/{repo}/issues/{issue_number}", token, payload=payload)
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("Unable to update issue", status)
    return GitHubIssue(
        id=data["id"],
        number=data["number"],
        title=data.get("title", ""),
        body=data.get("body", ""),
        url=data.get("html_url", ""),
        state=data.get("state", "open"),
        labels=[label.get("name") for label in data.get("labels", [])],
    )


def close_issue(token: str, owner: str, repo: str, issue_number: int) -> GitHubIssue:
    return update_issue(token, owner, repo, issue_number, state="closed")


def comment_on_issue(token: str, owner: str, repo: str, issue_number: int, body: str) -> None:
    status, _ = _request(
        "POST",
        f"/repos/{owner}/{repo}/issues/{issue_number}/comments",
        token,
        payload={"body": body},
    )
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("Unable to comment on issue", status)

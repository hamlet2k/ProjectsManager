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
    milestone_number: Optional[int]
    milestone_title: Optional[str]
    milestone_state: Optional[str]


@dataclass
class GitHubProjectColumn:
    """Representation of a GitHub project column."""

    id: int
    name: str


@dataclass
class GitHubProject:
    """Representation of a GitHub project with its columns."""

    id: int
    name: str
    columns: List[GitHubProjectColumn]


@dataclass
class GitHubMilestone:
    """Representation of a GitHub milestone."""

    number: int
    title: str
    state: str


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
        logging.error("Unable to decrypt GitHub token due to invalid token or key.")
        return None


def _headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json, application/vnd.github.inertia-preview+json",
        "User-Agent": "ProjectsManager-Integration",
        "Content-Type": "application/json",
    }


_UNSET = object()


def _parse_issue(payload: Dict[str, Any]) -> GitHubIssue:
    milestone_data = payload.get("milestone") if isinstance(payload.get("milestone"), dict) else None
    return GitHubIssue(
        id=payload["id"],
        number=payload["number"],
        title=payload.get("title", ""),
        body=payload.get("body", ""),
        url=payload.get("html_url", ""),
        state=payload.get("state", "open"),
        labels=[label.get("name") for label in payload.get("labels", []) if isinstance(label, dict)],
        milestone_number=milestone_data.get("number") if milestone_data else None,
        milestone_title=milestone_data.get("title") if milestone_data else None,
        milestone_state=milestone_data.get("state") if milestone_data else None,
    )


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
            if owner is not None:
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


def create_issue(
    token: str,
    owner: str,
    repo: str,
    title: str,
    body: str,
    labels: Iterable[str],
    *,
    milestone: Optional[int] = None,
) -> GitHubIssue:
    all_labels = set(labels)
    all_labels.add(GITHUB_APP_LABEL)
    ensure_labels(token, owner, repo, all_labels)

    payload: Dict[str, Any] = {
        "title": title,
        "body": body,
        "labels": sorted(all_labels),
    }
    if milestone is not None:
        payload["milestone"] = milestone

    status, payload = _request(
        "POST",
        f"/repos/{owner}/{repo}/issues",
        token,
        payload=payload,
    )
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status == 404:
        raise GitHubError("Repository not found", status)
    if status >= 400:
        raise GitHubError("Unable to create issue", status)
    return _parse_issue(payload)


def fetch_issue(token: str, owner: str, repo: str, issue_number: int) -> GitHubIssue:
    status, payload = _request("GET", f"/repos/{owner}/{repo}/issues/{issue_number}", token)
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("Unable to fetch issue", status)
    return _parse_issue(payload)


def update_issue(
    token: str,
    owner: str,
    repo: str,
    issue_number: int,
    *,
    title: Optional[str] = None,
    body: Optional[str] = None,
    labels: Optional[Iterable[str]] = None,
    state: Optional[str] = None,
    milestone: Any = _UNSET,
) -> GitHubIssue:
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
    if milestone is not _UNSET:
        payload["milestone"] = milestone

    status, data = _request("PATCH", f"/repos/{owner}/{repo}/issues/{issue_number}", token, payload=payload)
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("Unable to update issue", status)
    return _parse_issue(data)


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


def remove_label_from_issue(token: str, owner: str, repo: str, issue_number: int, label: str) -> List[str]:
    """
    Remove a specific label from a GitHub issue.

    Returns the remaining labels when successful.
    """
    endpoint = f"/repos/{owner}/{repo}/issues/{issue_number}/labels/{quote(label)}"
    status, payload = _request("DELETE", endpoint, token)
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError(f"Unable to remove label '{label}' from issue", status)
    if isinstance(payload, list):
        return [entry.get("name") for entry in payload if isinstance(entry, dict) and entry.get("name")]
    return []


def list_project_columns(token: str, project_id: int) -> List[GitHubProjectColumn]:
    columns: List[GitHubProjectColumn] = []
    page = 1
    while True:
        status, payload = _request(
            "GET",
            f"/projects/{project_id}/columns?per_page=100&page={page}",
            token,
        )
        if status in (401, 403):
            raise GitHubError("Unauthorized", status)
        if status == 404:
            break
        if status >= 400:
            raise GitHubError("Unable to list project columns", status)
        if not payload:
            break
        for column in payload:
            column_id = column.get("id")
            name = column.get("name")
            if column_id is None or name is None:
                continue
            columns.append(GitHubProjectColumn(id=column_id, name=name))
        if len(payload) < 100:
            break
        page += 1
    return columns


def list_repository_projects(token: str, owner: str, repo: str) -> List[GitHubProject]:
    projects: List[GitHubProject] = []
    page = 1
    while True:
        status, payload = _request(
            "GET",
            f"/repos/{owner}/{repo}/projects?per_page=100&page={page}",
            token,
        )
        if status in (401, 403):
            raise GitHubError("Unauthorized", status)
        if status == 404:
            raise GitHubError("Repository not found", status)
        if status >= 400:
            raise GitHubError("Unable to list projects", status)
        if not payload:
            break
        for project in payload:
            project_id = project.get("id")
            name = project.get("name")
            if project_id is None or name is None:
                continue
            columns = list_project_columns(token, project_id)
            projects.append(GitHubProject(id=project_id, name=name, columns=columns))
        if len(payload) < 100:
            break
        page += 1
    return projects


def list_repository_milestones(token: str, owner: str, repo: str) -> List[GitHubMilestone]:
    milestones: List[GitHubMilestone] = []
    page = 1
    while True:
        status, payload = _request(
            "GET",
            f"/repos/{owner}/{repo}/milestones?per_page=100&page={page}&state=all",
            token,
        )
        if status in (401, 403):
            raise GitHubError("Unauthorized", status)
        if status == 404:
            raise GitHubError("Repository not found", status)
        if status >= 400:
            raise GitHubError("Unable to list milestones", status)
        if not payload:
            break
        for milestone in payload:
            number = milestone.get("number")
            title = milestone.get("title")
            state = milestone.get("state")
            if number is None or title is None or state is None:
                continue
            milestones.append(GitHubMilestone(number=number, title=title, state=state))
        if len(payload) < 100:
            break
        page += 1
    return milestones


def add_issue_to_project(token: str, column_id: int, issue_id: int) -> None:
    status, _ = _request(
        "POST",
        f"/projects/columns/{column_id}/cards",
        token,
        payload={"content_id": issue_id, "content_type": "Issue"},
    )
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status == 404:
        raise GitHubError("Project column not found", status)
    if status in (200, 201, 202, 204, 422):
        return
    if status >= 400:
        raise GitHubError("Unable to add issue to project", status)

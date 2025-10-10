"""Utilities for interacting with the GitHub API."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from dataclasses import dataclass
from http.client import RemoteDisconnected
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib import request as urllib_request, error as urllib_error
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

GITHUB_API_BASE = "https://api.github.com"
GITHUB_APP_LABEL = "ProjectsManager"
MISSING_ISSUE_STATUS_CODES = {404, 410}
PROJECTS_ACCEPT_HEADER = "application/vnd.github+json, application/vnd.github.inertia-preview+json"
UNSET = object()
GRAPHQL_PROJECTS_QUERY = """
query($login: String!, $first: Int!) {
  user(login: $login) {
    projectsV2(first: $first) {
      nodes {
        id
        title
        number
        url
        closed
      }
    }
  }
  organization(login: $login) {
    projectsV2(first: $first) {
      nodes {
        id
        title
        number
        url
        closed
      }
    }
  }
}
"""
GRAPHQL_PROJECT_MUTATION = """
mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
    item {
      id
    }
  }
}
"""


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
    node_id: str
    number: int
    title: str
    body: str
    url: str
    state: str
    labels: List[str]
    milestone_number: Optional[int]
    milestone_title: str
    milestone_state: Optional[str]
    milestone_due_on: Optional[str]


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


def _headers(token: str, *, accept: Optional[str] = None) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": accept or "application/vnd.github+json",
        "User-Agent": "ProjectsManager-Integration",
        "Content-Type": "application/json",
    }


def _request(
    method: str,
    endpoint: str,
    token: str,
    payload: Optional[dict] = None,
    *,
    accept: Optional[str] = None,
) -> Tuple[int, Any]:
    url = endpoint if endpoint.startswith("http") else f"{GITHUB_API_BASE}{endpoint}"
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib_request.Request(
        url,
        data=data,
        headers=_headers(token, accept=accept),
        method=method,
    )
    try:
        with urllib_request.urlopen(request, timeout=20) as response:
            status = response.getcode()
            raw = response.read()
    except urllib_error.HTTPError as error:
        status = error.code
        raw = error.read()
    except RemoteDisconnected as error:
        raise GitHubError("GitHub closed the connection unexpectedly.") from error
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


def _graphql_request(
    token: str,
    query: str,
    variables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"query": query}
    if variables:
        payload["variables"] = variables

    status, response = _request(
        "POST",
        f"{GITHUB_API_BASE}/graphql",
        token,
        payload=payload,
        accept="application/json",
    )

    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("GitHub GraphQL request failed", status)

    if not isinstance(response, dict):
        raise GitHubError("Unexpected GraphQL response payload.")

    errors = response.get("errors")
    if errors:
        message = errors[0].get("message", "GitHub GraphQL request failed")
        status_code = 400
        for entry in errors:
            error_type = (entry.get("extensions") or {}).get("code") or entry.get("type")
            if error_type == "FORBIDDEN":
                status_code = 403
                break
            if error_type in {"NOT_FOUND", "RESOURCE_NOT_FOUND"}:
                status_code = 404
        raise GitHubError(message, status_code)

    data = response.get("data")
    if data is None:
        raise GitHubError("GitHub GraphQL request returned no data.")
    if not isinstance(data, dict):
        raise GitHubError("Unexpected GraphQL data payload type.")

    return data


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


def _list_classic_repository_projects(
    token: str, owner: str, repo: str
) -> List[Dict[str, Any]]:
    projects: List[Dict[str, Any]] = []
    page = 1
    while True:
        status, payload = _request(
            "GET",
            f"/repos/{owner}/{repo}/projects?per_page=100&page={page}",
            token,
            accept=PROJECTS_ACCEPT_HEADER,
        )
        if status in (401, 403):
            raise GitHubError("Unauthorized", status)
        if status == 404:
            raise GitHubError("Repository not found", status)
        if status == 410:
            raise GitHubError(
                "GitHub repository projects are not available for this repository.",
                status,
            )
        if status >= 400:
            raise GitHubError("Unable to list projects", status)
        if not isinstance(payload, list) or not payload:
            break
        for project in payload:
            identifier = project.get("id")
            if identifier is None:
                continue
            name = project.get("name") or project.get("body") or f"Project #{identifier}"
            projects.append({"id": str(identifier), "name": name, "type": "classic"})
        if len(payload) < 100:
            break
        page += 1
    return projects


def list_repository_projects(token: str, owner: str, repo: str) -> List[Dict[str, Any]]:
    projects: List[Dict[str, Any]] = []

    try:
        data = _graphql_request(
            token,
            GRAPHQL_PROJECTS_QUERY,
            {"login": owner, "first": 100},
        )
    except GitHubError as error:
        if error.status_code in (401, 403):
            raise
        # If the owner is not found, fall back to the classic API to preserve previous behaviour.
        if error.status_code == 404:
            classic = _list_classic_repository_projects(token, owner, repo)
            return classic
        logging.warning("Unable to load GitHub Projects V2 for %s: %s", owner, error)
    else:
        container = data.get("organization") or data.get("user")
        nodes = (
            container.get("projectsV2", {}).get("nodes")
            if isinstance(container, dict)
            else None
        )
        if nodes:
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                identifier = node.get("id")
                title = node.get("title")
                if not identifier or not title:
                    continue
                projects.append(
                    {
                        "id": identifier,
                        "name": title,
                        "number": node.get("number"),
                        "url": node.get("url"),
                        "closed": node.get("closed"),
                        "type": "v2",
                    }
                )

    if projects:
        return projects

    # Fall back to the classic projects API when no V2 projects are available.
    return _list_classic_repository_projects(token, owner, repo)


def list_repository_milestones(token: str, owner: str, repo: str) -> List[Dict[str, Any]]:
    milestones: List[Dict[str, Any]] = []
    page = 1
    while True:
        status, payload = _request(
            "GET",
            f"/repos/{owner}/{repo}/milestones?state=all&per_page=100&page={page}",
            token,
        )
        if status in (401, 403):
            raise GitHubError("Unauthorized", status)
        if status == 404:
            raise GitHubError("Repository not found", status)
        if status >= 400:
            raise GitHubError("Unable to list milestones", status)
        if not isinstance(payload, list) or not payload:
            break
        for milestone in payload:
            number = milestone.get("number")
            if number is None:
                continue
            title = milestone.get("title") or f"Milestone #{number}"
            state = milestone.get("state") or "open"
            due_on = milestone.get("due_on")
            milestones.append(
                {
                    "number": number,
                    "title": title,
                    "state": state,
                    "due_on": due_on,
                }
            )
        if len(payload) < 100:
            break
        page += 1
    return milestones


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
    milestone_payload = payload.get("milestone") or {}
    return GitHubIssue(
        id=payload["id"],
        node_id=payload.get("node_id", ""),
        number=payload["number"],
        title=payload.get("title", ""),
        body=payload.get("body", ""),
        url=payload.get("html_url", ""),
        state=payload.get("state", "open"),
        labels=[label.get("name") for label in payload.get("labels", [])],
        milestone_number=milestone_payload.get("number"),
        milestone_title=milestone_payload.get("title") or "",
        milestone_state=milestone_payload.get("state"),
        milestone_due_on=milestone_payload.get("due_on"),
    )


def fetch_issue(token: str, owner: str, repo: str, issue_number: int) -> GitHubIssue:
    status, payload = _request("GET", f"/repos/{owner}/{repo}/issues/{issue_number}", token)
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("Unable to fetch issue", status)
    milestone_payload = payload.get("milestone") or {}
    return GitHubIssue(
        id=payload["id"],
        node_id=payload.get("node_id", ""),
        number=payload["number"],
        title=payload.get("title", ""),
        body=payload.get("body", ""),
        url=payload.get("html_url", ""),
        state=payload.get("state", "open"),
        labels=[label.get("name") for label in payload.get("labels", [])],
        milestone_number=milestone_payload.get("number"),
        milestone_title=milestone_payload.get("title") or "",
        milestone_state=milestone_payload.get("state"),
        milestone_due_on=milestone_payload.get("due_on"),
    )


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
    milestone: object = UNSET,
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
    if milestone is not UNSET:
        payload["milestone"] = milestone

    status, data = _request("PATCH", f"/repos/{owner}/{repo}/issues/{issue_number}", token, payload=payload)
    if status in MISSING_ISSUE_STATUS_CODES:
        raise GitHubError("Issue not found", status)
    if status in (401, 403):
        raise GitHubError("Unauthorized", status)
    if status >= 400:
        raise GitHubError("Unable to update issue", status)
    milestone_payload = data.get("milestone") or {}
    return GitHubIssue(
        id=data["id"],
        node_id=data.get("node_id", ""),
        number=data["number"],
        title=data.get("title", ""),
        body=data.get("body", ""),
        url=data.get("html_url", ""),
        state=data.get("state", "open"),
        labels=[label.get("name") for label in data.get("labels", [])],
        milestone_number=milestone_payload.get("number"),
        milestone_title=milestone_payload.get("title") or "",
        milestone_state=milestone_payload.get("state"),
        milestone_due_on=milestone_payload.get("due_on"),
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


def add_issue_to_project(token: str, project_id: str, issue_node_id: str) -> None:
    if not project_id or not issue_node_id:
        raise GitHubError("Project id and issue id are required to add an issue to a project.")

    try:
        data = _graphql_request(
            token,
            GRAPHQL_PROJECT_MUTATION,
            {"project": project_id, "content": issue_node_id},
        )
    except GitHubError as error:
        message = str(error).lower()
        if "already exists" in message:
            return
        raise

    mutation_payload = data.get("addProjectV2ItemById") if isinstance(data, dict) else None
    if not mutation_payload:
        raise GitHubError("Unable to add issue to the GitHub project.")

# GitHub Feedback Flow Integration

This document describes how ProjectsManager turns feedback submissions into GitHub issues by using the GitHub App installation for authentication.

---

## Objective

Allow any logged-in user to submit feedback from the modal dialog and have it create a GitHub issue automatically—no personal access tokens or manual token rotation required.

---

## Components Involved

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Feedback route | `app.py` | Validates the payload, resolves the GitHub repository, and orchestrates issue creation |
| Token helper | `utils/github_token.py` | Issues and caches short-lived installation tokens via PyGithub’s `GithubIntegration` |
| GitHub service | `services/github_service.py` | Provides `create_issue`, which performs the API call using the installation token |

> Optional helper scripts in `tools/` can still be used for manual diagnostics, but the runtime code now relies on `utils/github_token.py`.

---

## End-to-End Flow

### 1. User submits feedback

The frontend modal POSTs JSON to `/api/feedback`, including a CSRF token and optional labels.

### 2. Route processing (`app.py`)

High-level steps taken by `submit_feedback`:

1. Ensure the user is authenticated (`g.user` is present).
2. Validate CSRF and required fields (`title`, `body`).
3. De-duplicate labels and append `#feedback` when missing.
4. Read `GITHUB_FEEDBACK_REPOSITORY` from configuration, split into `owner` / `repository`.
5. Request an installation token via `get_github_token()`. Any failure is logged and returned to the user as `Feedback integration could not be initialized.`.
6. Call `create_issue(token, owner, repository, title, body, labels)`.
7. Return success payload with `issue_url`, `issue_number`, and a fresh CSRF token.

### 3. Token acquisition (`utils/github_token.py`)

Key details of `get_github_token`:

- Maintains an in-memory cache storing the token and its expiration timestamp.
- Reuses the cached token while at least 60 seconds of validity remain.
- When a refresh is required, reads the GitHub App credentials from environment variables (`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY_PATH`) and calls `GithubIntegration.get_access_token(...)`.
- Logs an INFO message when a new token is generated so developers can observe refreshes.
- Raises a `RuntimeError` if any required environment variables are missing, allowing the route to surface a friendly 500 response.

### 4. Issue creation (`services/github_service.py`)

`create_issue` uses PyGithub to authenticate with the installation token and open an issue in the configured repository. Any `GitHubError` is mapped to a user-facing message through `_github_error_response`.

---

## Automatic Token Refresh

1. Every feedback submission invokes `get_github_token`.
2. Cached tokens are reused until their remaining lifetime drops below 60 seconds.
3. When refreshed, the helper generates a new token and caches it along with its expiry.
4. The route logs failures and returns a 500 response if token acquisition fails.

---

## Required Environment Variables

```
GITHUB_APP_ID=<numeric app id>
GITHUB_INSTALLATION_ID=<numeric installation id>
GITHUB_PRIVATE_KEY_PATH=<absolute path to the app’s .pem key>
GITHUB_FEEDBACK_REPOSITORY=<owner>/<repository>
```

Ensure these values are exported (or loaded via `.env`) before starting the Flask app.

---

## Validation Checklist

| Scenario | Expected Result |
|----------|-----------------|
| Submit valid feedback | Issue created with `#feedback` label and success message |
| Invalid CSRF token | Error response, no GitHub call |
| Missing title/body | Validation error message |
| Token acquisition failure | 500 with “Feedback integration could not be initialized.” and server log entry |
| Token expiry | Helper logs “Generated new GitHub App token…” and request succeeds |

---

## Troubleshooting Tips

- **404 when fetching token**: The installation id is incorrect or the app is not installed on the target repository.
- **Missing env var**: Verify environment variables with `print(os.getenv("NAME"))` inside a Flask shell.
- **Manual inspection**: Use `python tools/github_app_token.py --jwt` and `python tools/github_installation_token.py --raw` to query GitHub directly when debugging credentials.

With this flow in place, ProjectsManager keeps feedback submissions secure, stateless, and automatically authenticated through GitHub App tokens.

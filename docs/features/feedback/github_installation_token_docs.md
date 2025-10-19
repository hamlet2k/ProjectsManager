# GitHub App Installation Tokens

ProjectsManager uses a GitHub App installation to authenticate the feedback workflow. This guide explains how installation tokens are generated automatically at runtime, how to supply the required credentials, and how to debug issues when token creation fails.

---

## Authentication Flow Overview

1. **Credentials** – The Flask app needs three pieces of information from the environment:
   - `GITHUB_APP_ID`
   - `GITHUB_INSTALLATION_ID`
   - `GITHUB_PRIVATE_KEY_PATH` (absolute path to the `.pem` file downloaded from the GitHub App settings)

2. **Token helper** – `utils/github_token.py` loads those values and instantiates `github.GithubIntegration`.

3. **Access token request** – `GithubIntegration.get_access_token(installation_id)` returns a short‑lived installation token (1 hour). The helper caches the token and its expiry, refreshing it automatically when only 60 seconds remain.

4. **Usage** – The `/api/feedback` route asks for a token via `get_github_token()`. If the helper cannot create a token, it raises an exception that the route converts into a user-friendly 500 error.

---

## Environment Setup

Add the following entries to `.env` (values shown here are illustrative):

```
GITHUB_APP_ID=123456
GITHUB_INSTALLATION_ID=9023456
GITHUB_PRIVATE_KEY_PATH=path/to/private-key.pem
GITHUB_FEEDBACK_REPOSITORY=hamlet2k/ProjectsManager
```

> After updating `.env`, re-source the environment (or restart the Flask app) so the process picks up the new values.

---

## Runtime Behaviour

- Tokens are requested lazily. The first call to `get_github_token()` after startup generates a token and logs a message similar to `Generated new GitHub App token (valid for 1 hour).`
- Subsequent calls reuse the cached token until the helper detects that less than 60 seconds of validity remain, at which point it refreshes the token and logs again.
- If any required environment variable is missing, `_generate_new_token` raises a `RuntimeError`. The feedback route catches the exception, records a stack trace, and returns `Feedback integration could not be initialized.` to the user.
- A `github.GithubException.UnknownObjectException` (HTTP 404) indicates that the installation ID does not match the repository or the app is not installed on the owner.

---

## Manual Debugging Tools (Optional)

While the application no longer depends on standalone scripts, the utilities under `tools/` remain helpful when diagnosing credential issues:

- `python tools/github_app_token.py --jwt` – produce a JWT signed with the private key.
- `python tools/github_installation_token.py --raw` – exchange the JWT for an installation token and print it.
- Use the raw token with `curl` to verify repository access:

  ```powershell
  $token = python tools/github_installation_token.py --raw
  curl -L `
    -H "Authorization: Bearer $token" `
    -H "Accept: application/vnd.github+json" `
    https://api.github.com/repos/<owner>/<repo>/issues
  ```

These scripts are useful for confirming that the app ID, installation ID, permissions, and private key are aligned.

---

## Troubleshooting Cheatsheet

| Symptom | Likely Cause | Suggested Action |
|---------|--------------|------------------|
| `404 {"message": "Not Found"}` when generating token | App not installed on the target owner/repository, or installation ID is incorrect | Reinstall the GitHub App and grab the current installation ID from the app dashboard |
| `Missing required GitHub App environment variables` | One or more credentials not exported | Check `.env`, ensure the variables are loaded before running Flask |
| `bad credentials` or `401` from GitHub | Private key does not match the app, or JWT is malformed | Download a fresh private key, update `GITHUB_PRIVATE_KEY_PATH`, restart |
| Token keeps regenerating on every request | System clock skew or cached expiry earlier than current time | Confirm server clock is correct and that the cache is shared across workers (only process-level cache is provided) |

---

## Quick Verification Steps

1. Run the Flask app and submit feedback.
2. Observe the server logs:
   - On first submission: INFO log about generating a new token.
   - On subsequent submissions within the hour: no token log (cache hit).
3. Confirm an issue appears in the configured repository with the `#feedback` label.

With the helper and environment configured correctly, ProjectsManager refreshes GitHub App installation tokens automatically and keeps the feedback flow reliable. 

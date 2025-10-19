# 🧭 Task: Update Feedback Flow to Use Dynamic GitHub Token Helper

## 🎯 Objective
Refactor the feedback API endpoint (`/api/feedback`) so that it uses the new helper utility `get_github_token()` from `utils/github_token.py` instead of relying on a static token stored in `app.config`.

This ensures GitHub App installation tokens are **refreshed automatically** when expired.

---

## ⚙️ Context
- The helper file is already implemented at:  
  `app/utils/github_token.py`
- Function available:  
  ```python
  from utils.github_token import get_github_token
  token = get_github_token()
  ```
  This function:
  - Returns a cached valid token if available.
  - Generates a new installation token using the GitHub App credentials if expired.
- The current implementation of `/api/feedback` in `app.py` still uses:
  ```python
  token = app.config.get("GITHUB_APP_INSTALLATION_TOKEN")
  ```
  which only loads once at Flask startup.

---

## 🧱 Requirements

### 1. Update Backend Endpoint
Modify the existing `/api/feedback` route to:
- Import and call `get_github_token()` instead of reading from app config.
- Handle any exceptions gracefully (log and return user-friendly message if token generation fails).
- Leave all CSRF, validation, and response logic unchanged.

Example implementation:
```python
from utils.github_token import get_github_token

@app.route("/api/feedback", methods=["POST"])
def submit_feedback():
    ...
    try:
        token = get_github_token()
    except Exception:
        logging.exception("Failed to obtain GitHub App token")
        return _feedback_error("Feedback integration could not be initialized.", status=500)
    ...
    issue = create_issue(token, owner, repository, title, body, labels)
```

---

### 2. Keep Compatibility
- Continue reading the repository path from:
  ```python
  repo_config = app.config.get("GITHUB_FEEDBACK_REPOSITORY")
  ```
- Do **not** modify the frontend submission logic.
- Keep label logic and `#feedback` auto-tagging intact.

---

### 3. Validation
Test that:
- Submitting feedback successfully creates a GitHub issue when token is valid.
- Token refreshes automatically after expiration (no manual reconfiguration).
- API returns proper error message when the helper cannot generate a token (e.g., missing env vars).

---

## ✅ Acceptance Criteria
- The feedback flow no longer depends on a static token.
- GitHub App token generation and refresh are automatic.
- Error handling and logging are added for token issues.
- User experience remains identical.

---

## 🧩 Reference Files
- `app/utils/github_token.py` — dynamic token helper
- `app.py` — contains `/api/feedback` route
- `services/github_service.py` — issue creation logic

---

💡 *Tip:* Add a brief debug log (INFO level) when a new token is generated, so developers can confirm token refreshes during runtime.

# 🧭 Task: Add a “Provide Feedback” feature with GitHub Issue creation

## 🎯 Objective
Implement a **feedback button** in the navbar that opens a **modal dialog** allowing users to submit feedback directly from the web app.

Upon submission, the backend will use the existing `/api/feedback` endpoint (Flask) to create a **GitHub issue** in the repository using the **GitHub App installation token**.  
The created issue must include:
- User-provided title and description
- A label chosen by the user (`question`, `enhancement`, or `bug`)
- An automatically appended label: `#feedback`

---

## 🧱 Frontend Requirements

### 1. Navbar Integration
- Add a **“Feedback”** button (text or icon, e.g., a speech bubble 💬) to the main navbar.
- The button should open a modal when clicked.

### 2. Modal Dialog
The modal should include:
- **Title input** (text, required)
- **Description textarea** (multiline, required)
- **Label selector** (`question`, `enhancement`, `bug`) — can be a dropdown or radio buttons
- **Submit** and **Cancel** buttons

Behavior:
- When the modal opens, the title field should be focused.
- Submitting triggers a POST to `/api/feedback` with this JSON payload:
  ```json
  {
    "title": "User entered title",
    "body": "User entered description",
    "labels": ["enhancement", "#feedback"]
  }
  ```
- On success: show success message with link to created issue.
- On failure: show error message.

### 3. Design & UX
- Use Bootstrap modal and form styling.
- Responsive layout.
- No new dependencies.

---

## ⚙️ Backend Endpoint
Re-use `/api/feedback` implemented in Flask. Confirm it supports `labels` array and appends `#feedback` automatically.

If not, extend it:
```python
payload_labels = data.get("labels", [])
if "#feedback" not in payload_labels:
    payload_labels.append("#feedback")
payload = {
    "title": title,
    "body": body,
    "labels": payload_labels,
}
```

---

## ✅ Acceptance Criteria
- Feedback button appears in navbar.
- Modal works and validates input.
- Creates GitHub issue via backend.
- Issue includes user label + `#feedback`.
- No page reloads.

---

## 🚀 Deliverables
1. Navbar button
2. Modal HTML and JS
3. JS logic for submission
4. Backend update to handle labels

---

## 🧩 Example UI Sketch

```html
<!-- Navbar -->
<nav class="navbar navbar-expand-lg bg-light">
  ...
  <button class="btn btn-outline-secondary ms-3" data-bs-toggle="modal" data-bs-target="#feedbackModal">
    <i class="bi bi-chat-dots"></i> Feedback
  </button>
</nav>

<!-- Modal -->
<div class="modal fade" id="feedbackModal" tabindex="-1" aria-labelledby="feedbackModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <form id="feedbackForm">
        <div class="modal-header">
          <h5 class="modal-title" id="feedbackModalLabel">Submit Feedback</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="feedbackTitle" class="form-label">Title</label>
            <input type="text" id="feedbackTitle" name="title" class="form-control" required>
          </div>
          <div class="mb-3">
            <label for="feedbackBody" class="form-label">Description</label>
            <textarea id="feedbackBody" name="body" class="form-control" rows="4" required></textarea>
          </div>
          <div class="mb-3">
            <label for="feedbackLabel" class="form-label">Type</label>
            <select id="feedbackLabel" name="label" class="form-select">
              <option value="question">Question</option>
              <option value="enhancement">Enhancement</option>
              <option value="bug">Bug</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary">Submit Feedback</button>
        </div>
      </form>
    </div>
  </div>
</div>

<script>
document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const title = form.title.value.trim();
  const body = form.body.value.trim();
  const label = form.label.value;
  if (!title || !body) return alert('Please complete all fields.');
  const payload = { title, body, labels: [label, '#feedback'] };
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.success) {
    alert('Feedback sent! View issue: ' + json.issue_url);
    form.reset();
    const modal = bootstrap.Modal.getInstance(document.getElementById('feedbackModal'));
    modal.hide();
  } else {
    alert('Error: ' + json.message);
  }
});
</script>
```

---

💡 *Tip:*  
If your app uses Jinja templates, put the modal HTML at the bottom of `base.html` so it’s globally available.

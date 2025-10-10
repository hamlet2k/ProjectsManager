# 🧩 GitHub Integration Setup in ProjectsManager

This guide explains how to connect your ProjectsManager account to GitHub to synchronize issues, milestones, and projects.

---

## 🪄 Step 1. Enable GitHub Integration

1. Navigate to **Profile → GitHub Integration**.  
2. Toggle **Enable GitHub Integration**.  
3. Paste your GitHub **Personal Access Token (PAT)** in the provided field.  
4. Click **Test Connection** to confirm validity.

---

## 🧠 Step 2. Configure Repository Access

Once verified, ProjectsManager will automatically retrieve your available repositories via the GitHub API.  

- Select the repository to associate with your scopes.  
- This setting defines where new issues are created when syncing tasks.

---

## ⚙️ Step 3. Optional Fields: Project & Milestone

You can configure a **default GitHub Project** and **Milestone** per scope.

- When a new task is created and synced, it will automatically inherit the configured milestone and project.
- If the milestone or project changes in the app, the update is synced back to GitHub.

### 🔗 GitHub Projects (v2) Requirements

- To automatically add issues to your GitHub **Projects (v2)** board, ensure your token includes:
  - `project` (Classic token), or  
  - `Projects (Read & Write)` (Fine-grained token)
- This uses the **GraphQL API**, not the deprecated REST API.
- Works with **personal projects** and **repository-level projects** — no organization access required.

---

## 🔒 Step 4. Security Notes

- Your token is encrypted and never exposed to third parties.  
- Only minimal permissions are used (issues, metadata, projects).  
- You can disable the integration toggle anytime — data will remain stored locally.

---

## 🚀 Step 5. Common Actions

- **Create GitHub Issue** → From any task, click the GitHub icon.  
- **Sync Issue** → Click the refresh icon to update task data from GitHub.  
- **Close Task** → Closes the linked GitHub issue automatically.  
- **Global Sync** → Refresh all linked issues for the active user.

---

## 🧩 Troubleshooting

| Problem | Solution |
|----------|-----------|
| Token invalid | Regenerate a new one and re-test connection |
| GitHub project not found | Ensure Projects (v2) is enabled and token has correct scope |
| Project not updated | Check that the issue exists in the linked repository |

# 🧩 How to Set Up GitHub Integration in ProjectsManager

Follow these steps to connect your GitHub account to ProjectsManager and enable issue synchronization.

---

## ⚙️ Step 1. Open the Profile Page

1. Log into **ProjectsManager**
2. Go to your **User Profile** (top-right corner or sidebar)
3. Scroll to the **GitHub Integration** section

---

## 🔑 Step 2. Enable GitHub Integration

1. Toggle **“Enable GitHub Integration”** to *ON*
2. Paste your GitHub **Personal Access Token (PAT)** (see the token creation guide)
3. Click **“Test Connection”**
   - The system will verify your token and permissions
   - If valid, you’ll see a success message

---

## 🧭 Step 3. Select Repository

1. Once verified, ProjectsManager will load your accessible repositories
2. Select the repository you want to sync tasks with
3. The repository info (`owner`, `name`, and `id`) will be stored securely

---

## 🧩 Step 4. Configure Optional Fields (Project & Milestone)

1. In the GitHub integration section, you can optionally select:
   - **Project** → the default GitHub Project for created issues
   - **Milestone** → the default milestone to assign issues to
2. These values will apply automatically when creating new linked tasks

---

## ✅ Step 5. Save and Use the Integration

Once your integration is active:

- Each task shows a **GitHub icon** to create or sync issues
- Linked tasks are automatically updated with issue state, title, and body
- Closing a task in ProjectsManager closes the linked issue in GitHub
- You can refresh or unlink issues manually

---

## 🧱 Troubleshooting

| Issue | Solution |
|-------|-----------|
| Token invalid or expired | Regenerate from GitHub and update in your profile |
| Repo not showing | Check that the token has access to that repo |
| Permission denied when syncing | Ensure your token includes `repo` and `issues:write` |
| Label or milestone missing | Ensure your token has `projects` and `metadata` read/write permissions |

---

Your GitHub integration is now ready! 🎉

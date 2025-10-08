# 🧩 How to Generate a GitHub Personal Access Token (PAT)

This guide explains how to create a **Personal Access Token (PAT)** with the correct permissions for the ProjectsManager GitHub integration.

---

## 🔑 Step 1. Open Your GitHub Developer Settings

1. Go to [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Choose one of the following:
   - **Fine-grained token (recommended)** → click *“Tokens (fine-grained)” → Generate new token*
   - **Classic token (legacy)** → click *“Personal access tokens (classic)” → Generate new token*

---

## 🧭 Step 2. Set the Token Name and Expiration

- Give the token a descriptive name, e.g. `ProjectsManager Integration`
- Choose an **expiration** — recommended: *no expiration* or *1 year*
- (Optional) Restrict the token to your ProjectsManager repository

---

## 🧩 Step 3. Set Required Permissions

### ✅ Fine-grained PAT (Recommended)

Grant **repository-level permissions**:

| Category | Permission | Access | Purpose |
|-----------|-------------|---------|----------|
| **Repository contents** | Contents | Read-only | To read repo metadata |
| **Issues** | Read & Write | Create, update, close issues, manage milestones |
| **Metadata** | Read-only | Required to access repo info |
| **Projects** | Read & Write | Assign issues to GitHub Projects |
| **Milestones** | (part of Issues) | Read & Write | Assign milestones |
| **Organizations (optional)** | Read | To access org-level repositories |

---

### 🧩 Classic PAT (Legacy)

Enable the following scopes:

```
repo
read:org
project
user:email (optional)
```

This covers:
- Creating/editing issues
- Assigning to milestones or projects
- Reading org repositories and metadata

---

## 🔒 Step 4. Generate and Copy the Token

- Click **Generate token**
- Copy it immediately — it will **not be shown again**
- Store it securely (you’ll paste it in ProjectsManager later)

---

## ⚠️ Security Tips

- Treat your token like a password
- Never share or commit it in code
- Revoke it if you suspect any exposure

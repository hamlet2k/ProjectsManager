# 🔐 GitHub Token Setup for ProjectsManager

This guide explains how to create and configure a **GitHub Personal Access Token (PAT)** to enable integration between ProjectsManager and your GitHub repositories, issues, and projects.

---

## 🪜 Step 1. Access Token Settings

1. Go to **GitHub → Settings → Developer settings → Personal access tokens**  
2. Choose **Fine-grained token** (recommended) or **Classic token** (fallback).  
3. Click **Generate new token**.

---

## ⚙️ Step 2. Token Scope and Repository Access

### Fine-grained Token (Recommended)
1. Under **Repository access**, select **Only select repositories** → choose your project repositories.  
2. Under **Repository permissions**, enable:

   | Permission | Access | Purpose |
   |-------------|---------|----------|
   | **Issues** | Read & Write | Create and update GitHub issues |
   | **Metadata** | Read-only | Required for repository info |
   | **Contents** | Read-only | Optional – fetch repo metadata |
   | **Projects** | Read & Write | Add synced tasks to GitHub Projects (v2) |

   ⚠️ *If “Projects” is not listed*, your GitHub account might not have Projects v2 REST permissions enabled. In that case, create a **Classic token**.

---

### Classic Token (Fallback)
When creating a **classic PAT**, enable these scopes:

- `repo` → Full repository access (issues, labels, etc.)
- `project` → Access and manage GitHub Projects (v2)
- `user` → Identify the account and user info
- `admin:org` → *(Optional)* required only if using organization projects

---

## 🧩 Step 3. Copy and Store Your Token

After generating your token:

1. Copy it immediately (you can’t view it again).  
2. In **ProjectsManager → Settings → GitHub Integration**, paste it into the **Token** field.  
3. Click **Test Connection** to verify integration.

---

## ✅ Step 4. Verification

If successful, ProjectsManager will be able to:

- Create and sync GitHub issues  
- Automatically link them with your GitHub Project (v2) board  
- Close or comment on issues when tasks are completed  

---

## 🧠 Notes

- Tokens are encrypted locally in your database.  
- The integration uses the **GitHub GraphQL API** for Projects v2 support.  
- Classic tokens currently provide the **broadest compatibility**.

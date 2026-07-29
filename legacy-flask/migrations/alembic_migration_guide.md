# 🧩 Alembic / Flask-Migrate Survival Guide  
### How to Handle Multiple Heads, Merges, and Migrations Without Losing Your Mind

---

## 💡 Why This Happens

Whenever **two branches** each introduce their own migration files, Alembic ends up with **two separate heads**.  
When you merge those branches, Alembic detects multiple “endpoints” in the migration graph:

```
Base → A → B → (head1)
         ↘︎ C → (head2)
```

Alembic can’t upgrade across two parallel heads — it needs a single linear chain — so you’ll always have to **merge them manually**.

---

## 🧠 Why It’s Not Your Fault

- Each feature branch (like `codex/...`) usually includes its own migration.  
- Flask-Migrate doesn’t auto-resolve multiple heads.  
- SQLite and Alembic’s lack of transactional DDL rollback make conflicts more visible.  

So, this is **expected behavior** — not a mistake in your process.

---

## ✅ The Smooth Migration Workflow

### 1️⃣ Always Start Fresh
Before creating *any new migration*, make sure you’re fully up-to-date:

```bash
git checkout main
git pull
flask db upgrade
```

This ensures your database schema is in sync with the latest main branch.

---

### 2️⃣ Create Migrations on Updated Branches
Now switch to your feature branch:

```bash
git checkout your-feature-branch
git merge main   # or git rebase main
flask db migrate -m "Your migration message"
```

This guarantees Alembic builds from the **latest head**, not an older one.

---

### 3️⃣ If You Still Get Multiple Heads (and You Will)

Run:
```bash
flask db heads
```

You’ll see something like:
```
202409200001 (head)
6f5b394bb1c4 (head)
```

Then merge them:
```bash
flask db merge -m "Merge multiple heads after scope GitHub configuration"
```

Edit the generated file so it looks like this:

```python
"""Merge multiple heads after scope GitHub configuration"""

revision = '790894651003'
down_revision = ("6f5b394bb1c4", "202409200001")
branch_labels = None
depends_on = None

def upgrade():
    pass

def downgrade():
    pass
```

**Important:**  
- Use `down_revision` (singular) even if multiple heads exist.  
- Never use `down_revisions` unless your Alembic version explicitly supports it.

Then run:
```bash
flask db upgrade
```

Confirm it’s clean:
```bash
flask db heads
flask db current
```
Should output something like:
```
790894651003 (head)
```

---

## 🧭 Optional Safety Feature

Add this snippet to the bottom of your `migrations/env.py` file to automatically warn you if multiple heads exist before migration:

```python
from alembic.script import ScriptDirectory
from alembic.runtime.environment import EnvironmentContext

script = ScriptDirectory.from_config(config)
with EnvironmentContext(config, script) as env:
    heads = script.get_heads()
    if len(heads) > 1:
        print(f"⚠️  Multiple migration heads detected: {heads}. Consider running `flask db merge`.")
```

---

## 🛠 Quick Reference Commands

| Action | Command |
|--------|----------|
| See current head | `flask db heads` |
| See current revision | `flask db current` |
| Merge multiple heads | `flask db merge -m "Merge multiple heads"` |
| Apply migrations | `flask db upgrade` |
| Generate migration | `flask db migrate -m "Message"` |
| Roll back last migration | `flask db downgrade -1` |

---

## 🚀 TL;DR
- Always **upgrade** before you **migrate**.  
- Only migrate from the latest `main` head.  
- If multiple heads appear, **merge them immediately**.  
- Don’t panic — it’s normal and fixable in 30 seconds.  

---

## 🧩 Bonus Tip

If you’re collaborating with others or Codex-generated migrations, consider keeping a naming convention like:

```
<date>_<short_description>_<branch_label>.py
```

Example:
```
20240920_scope_github_configuration_fw4jsg.py
```

This makes merges and debugging much clearer.

---

## ✅ Example of a Healthy Final State

After resolving all heads and upgrading successfully:

```bash
flask db heads
```
Output:
```
790894651003 (head)
```

```bash
flask db current
```
Output:
```
790894651003 (head)
```

🎉 Done! Database migrations are clean and consistent again.

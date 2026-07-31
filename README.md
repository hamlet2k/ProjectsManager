# Projects Manager

Family-friendly project and task manager. Track lists, tags, due dates, shares, and optional GitHub issues.

| Layer | Stack |
|--------|--------|
| Frontend | Vite + React + TypeScript + Tailwind (`web/`) |
| Backend / DB / Auth / Realtime | Supabase (`supabase/`) |
| Hosting | Vercel |
| GitHub API | Supabase Edge Functions (`github-proxy`, `github-credentials`) |

**Production:** https://projects-manager-navy.vercel.app  
**Repo default branch:** `main` (Supabase rebuild merged via [#130](https://github.com/hamlet2k/ProjectsManager/pull/130))

---

## Layout

```text
web/                 ← SPA (deploy this to Vercel)
supabase/            ← SQL migrations, Edge Functions, auth email templates
scripts/             ← data migration helpers, legacy cleanup
docs/                ← product + setup docs (see docs/README.md)
legacy-flask/        ← archived classic app (optional; remove after cutover)
```

UI copy says **projects**; the database still uses `scopes` for historical reasons.

---

## Features (current)

### Core
- Projects, tasks, tags, Markdown descriptions, due dates  
- Filters: search (incl. GitHub issue # / milestones when GH is active), sort by rank / name / due groups / created / tags  
- Drag reorder: full list on **Rank**; **within a tag group** when sorted by Tags  
- Share (invite user + invite links), roles owner / editor / viewer, notifications + realtime  
- Theme: light / dark / system  
- Import / Export: Text (optional checklist markers), JSON, CSV, AI backlog markdown  

### Project options (Edit project)
- **Task dependencies** on/off — hides dependency UI when off (edges kept)  
- **Advanced export on copy** on/off — simple checklist copy when off; Import/Export modal always available  

### GitHub (optional)
- User opt-in (Settings + PAT or Feedback Bot App for feedback)  
- One **default repository** per project; create / link / import issues; optional Project board  
- Complete → optional close issue; pull sync issue → task  
- App-native blockers + bidirectional GitHub blocked-by when both tasks are linked  
- Create GitHub issue when adding a task (opt-in checkbox, remembered)  
- Delete task: unlink only, or close open issue then delete (never deletes the issue on GitHub)  

See [docs/github-integration-matrix.md](docs/github-integration-matrix.md).

---

## Quick start

### 1. Supabase

1. Create/link a project.  
2. Apply migrations under `supabase/migrations/` (in order), or use the SQL Editor for any missing ones.  
3. **Auth → URL configuration**  
   - Site URL: production or `http://localhost:5173`  
   - Redirects: see [docs/auth-oauth-smtp.md](docs/auth-oauth-smtp.md)  
4. Deploy Edge Functions and secrets as needed (GitHub PAT encryption, Feedback Bot).  
5. Optional: custom SMTP + branded emails (`supabase/templates/`).

### 2. Web app

```powershell
cd web
copy .env.example .env
# VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 3. Deploy (Vercel)

```powershell
cd web
npx vercel --prod
```

Set the same `VITE_SUPABASE_*` vars in the Vercel project. Root of the Vercel project should be `web/` (or deploy from `web/`).

### 4. OAuth / SMTP / email templates

See [docs/auth-oauth-smtp.md](docs/auth-oauth-smtp.md) and [supabase/templates/README.md](supabase/templates/README.md).

---

## Docs index

| Doc | Purpose |
|-----|---------|
| [docs/README.md](docs/README.md) | Doc map |
| [docs/product-backlog.md](docs/product-backlog.md) | Authoritative product backlog |
| [docs/github-integration-matrix.md](docs/github-integration-matrix.md) | User vs project GitHub behavior |
| [docs/auth-oauth-smtp.md](docs/auth-oauth-smtp.md) | OAuth, SMTP, email templates |
| [docs/parity-backlog.md](docs/parity-backlog.md) | Classic UI parity (mostly complete) |
| [docs/rebuild-supabase.md](docs/rebuild-supabase.md) | Rebuild notes / permissions sketch |

---

## Security

- RLS enforces owner / editor / viewer.  
- GitHub PATs are not exposed to the browser; Edge Functions hold secrets.  
- Never commit `.env`, service role keys, or credential dumps.  

---

## Legacy Flask

`legacy-flask/` is the old stack. Use only for historical export if needed, then:

```powershell
.\scripts\remove-legacy.ps1
# type: DELETE LEGACY
```

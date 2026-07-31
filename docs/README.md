# Documentation

_Last updated 2026-07-31._ Stack: **Vite + React + Supabase + Vercel** (on `main`).

## Start here

| Audience | Read |
|----------|------|
| Setup / deploy | [../README.md](../README.md) |
| What to build next | [product-backlog.md](product-backlog.md) |
| GitHub rules | [github-integration-matrix.md](github-integration-matrix.md) |
| Login email / OAuth | [auth-oauth-smtp.md](auth-oauth-smtp.md) |
| Auth email HTML | [../supabase/templates/README.md](../supabase/templates/README.md) |

## Docs in this folder

| File | Status | Notes |
|------|--------|--------|
| [product-backlog.md](product-backlog.md) | **Active** | Authoritative backlog for the new stack |
| [github-integration-matrix.md](github-integration-matrix.md) | **Active** | User preference vs project binding (#35 adapted) |
| [auth-oauth-smtp.md](auth-oauth-smtp.md) | **Active** | Google/GitHub OAuth, SMTP, template apply |
| [parity-backlog.md](parity-backlog.md) | Mostly done | Classic Flask UI parity checklist |
| [rebuild-supabase.md](rebuild-supabase.md) | Historical + RLS sketch | Prefer root README for day-to-day setup |

## Product model (short)

- **Projects** (DB: `scopes`) own tasks, tags, shares, optional GitHub binding.  
- **Tasks** are flat (no subtasks). Order = global `rank`.  
- **Tags** filter and group; multi-tag tasks appear in one group when sorted by tags.  
- **Dependencies** are optional per project (`dependencies_enabled`).  
- **Export** can be simple copy or full modal (`advanced_export_enabled`).  
- **GitHub:** one default repo per project; issue links are project-global; user must opt in for mutations.

## Production

- App: https://projects-manager-navy.vercel.app  
- GitHub: https://github.com/hamlet2k/ProjectsManager  

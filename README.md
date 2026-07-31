# Projects Manager (Supabase + React)

Modern family project manager:

| Layer | Stack |
|--------|--------|
| Frontend | Vite + React + TypeScript + Tailwind (`web/`) |
| Backend / DB / Auth / Realtime | Supabase (`supabase/`) |
| Hosting | Vercel |
| GitHub API | Supabase Edge Functions |

## Current layout

```text
web/                 ← new SPA (what you deploy)
supabase/            ← SQL migrations + Edge Functions
scripts/             ← migration + cleanup helpers
docs/                ← rebuild notes
legacy-flask/        ← OLD Flask app (delete after cutover)
README.md
LICENSE
```

The Flask app was moved into **`legacy-flask/`** so the root already looks like the new project.  
You only need it for **exporting old data**. When migration is done, delete it.

---

## Clean end state (after migration)

```text
web/
supabase/
scripts/             # optional: keep or slim down
docs/
README.md
LICENSE
.gitignore
```

**Remove the old app:**

```powershell
.\scripts\remove-legacy.ps1
# confirm by typing: DELETE LEGACY
```

---

## Setup (you must do these)

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → run `supabase/migrations/20260727000000_init.sql`.
3. Auth → URL config: Site URL `http://localhost:5173`, redirect `http://localhost:5173/**`.
4. Copy Project URL + anon key.

### 2. Web app

```powershell
cd web
copy .env.example .env
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 3. Edge Functions (GitHub)

```powershell
supabase login
supabase link --project-ref YOUR_REF
supabase secrets set GITHUB_TOKEN_SECRET="your-long-random-secret"
supabase functions deploy github-credentials
supabase functions deploy github-proxy
```

### 4. Vercel

```powershell
cd web
npx vercel
```

Set the same `VITE_SUPABASE_*` env vars in Vercel. Add the production URL to Supabase Auth redirects.

### 5. Migrate data from Flask (optional)

See `scripts/migrate-from-flask/export_and_import.md`.

### 6. Delete Flask code

```powershell
.\scripts\remove-legacy.ps1
```

---

## Features

- Auth (password + magic link), profiles, light/dark/system theme  
- Scopes, hierarchical tasks, tags, Markdown descriptions  
- Sharing (user invite + invite links), notifications, realtime  
- GitHub token vault + issue create/sync via Edge Functions  
- One-shot import from the old database  

## Security

- RLS enforces owner / editor / viewer.  
- GitHub tokens are not readable by the browser client.  
- Never commit `.env`, service role keys, or `temp-passwords.json`.

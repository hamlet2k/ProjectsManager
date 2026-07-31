# Projects Manager — web app

Vite + React + TypeScript SPA. See the **repo root [README.md](../README.md)** for full setup.

## Dev

```bash
cp .env.example .env   # or copy on Windows
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy

Vercel project root should be this `web/` directory (or deploy from here). Production env: same `VITE_SUPABASE_*` as local.

## Structure

```text
src/app/          routes, layout, auth/theme providers
src/pages/        route screens
src/features/     scopes, tasks, github, notifications, feedback
src/components/   shared UI + icons
src/lib/          supabase client, permissions, shortcuts
```

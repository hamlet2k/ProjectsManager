import { Outlet, Link } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <Link to="/login" className="text-2xl font-bold tracking-tight">
          Projects<span className="text-[var(--color-primary)]">Manager</span>
        </Link>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Family projects, shared tasks, and optional GitHub sync
        </p>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <Outlet />
      </div>
    </div>
  )
}

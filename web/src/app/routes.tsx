import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { AppLayout } from '@/app/layouts/AppLayout'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { PageLoader } from '@/components/ui/Spinner'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ScopePage } from '@/pages/ScopePage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { InviteAcceptPage } from '@/pages/InviteAcceptPage'

function LegacyScopeRedirect() {
  const { scopeId } = useParams<{ scopeId: string }>()
  return <Navigate to={`/projects/${scopeId}`} replace />
}

function RequireAuth() {
  const { user, loading, configured } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Configure Supabase</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Copy <code>web/.env.example</code> to <code>web/.env</code> and set your project URL and
          anon key.
        </p>
      </div>
    )
  }

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
      </Route>

      <Route path="/invite/:token" element={<InviteAcceptPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects/:scopeId" element={<ScopePage />} />
          {/* Legacy path from "scopes" naming */}
          <Route path="scopes/:scopeId" element={<LegacyScopeRedirect />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

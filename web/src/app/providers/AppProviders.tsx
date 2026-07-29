import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './AuthProvider'
import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from './ThemeProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'

function ThemeAuthShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemeCloudBridge />
        {children}
      </AuthProvider>
    </ThemeProvider>
  )
}

/**
 * Theme strategy:
 * - localStorage (pm-theme) = this device’s preference (wins after first choice).
 * - profiles.theme = optional cloud seed for a brand-new device with no local key yet.
 * - Changing theme updates both localStorage and profile (so new devices can pick up a default).
 */
function ThemeCloudBridge() {
  const { profile, updateProfile } = useAuth()
  const { theme, setTheme } = useTheme()

  // First visit on this device: seed from profile if no local preference
  useEffect(() => {
    if (!profile?.theme) return
    let hasLocal = false
    try {
      hasLocal = localStorage.getItem(THEME_STORAGE_KEY) != null
    } catch {
      hasLocal = false
    }
    if (!hasLocal && profile.theme !== theme) {
      setTheme(profile.theme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Persist to profile when user changes theme (non-blocking cloud backup)
  useEffect(() => {
    if (!profile) return
    if (profile.theme === theme) return
    updateProfile({ theme }).catch(() => {
      /* localStorage already has the choice */
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  return null
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <ThemeAuthShell>{children}</ThemeAuthShell>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User, UserIdentity } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured, tryGetSupabase } from '@/lib/supabase/client'
import type { Profile, ThemePref } from '@/lib/supabase/types'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True after user opens a recovery email link (PASSWORD_RECOVERY). */
  passwordRecovery: boolean
  clearPasswordRecovery: () => void
  refreshProfile: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUp: (input: {
    email: string
    password: string
    name: string
    username: string
  }) => Promise<void>
  signInWithMagicLink: (email: string) => Promise<void>
  /** OAuth: Google or GitHub (Supabase Auth providers — not the GitHub task integration). */
  signInWithOAuth: (provider: 'google' | 'github') => Promise<void>
  /** Link another OAuth provider to the current account (redirects). */
  linkOAuthProvider: (provider: 'google' | 'github') => Promise<void>
  /** Unlink a provider identity (must keep at least one sign-in method). */
  unlinkOAuthIdentity: (identity: UserIdentity) => Promise<void>
  /** Send password-reset email (Supabase recovery link). */
  resetPasswordForEmail: (email: string) => Promise<void>
  /**
   * Set a new password for the current session (logged-in change or recovery).
   * Optionally verify current password first when changing while signed in.
   */
  updatePassword: (input: {
    newPassword: string
    currentPassword?: string
  }) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (patch: Partial<Pick<Profile, 'name' | 'username' | 'theme' | 'github_integration_enabled'>>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), [])

  const loadProfile = useCallback(async (userId: string, user?: User | null) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    if (data) {
      setProfile(data as Profile)
      return data as Profile
    }

    // Profile missing (trigger skipped / user created before migration / OAuth) — create one.
    const email = user?.email ?? ''
    const meta = user?.user_metadata ?? {}
    // Google: name / full_name; GitHub: user_name / preferred_username / login
    const baseUsername = String(
      meta.username ||
        meta.user_name ||
        meta.preferred_username ||
        meta.login ||
        email.split('@')[0] ||
        'user',
    )
      .replace(/[^A-Za-z0-9_.-]/g, '_')
      .slice(0, 70)
    const username = baseUsername.length >= 2 ? baseUsername : `user_${userId.slice(0, 6)}`
    const name = String(meta.name || meta.full_name || username).slice(0, 80) || username

    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username,
        name,
        email: email || `${userId}@users.local`,
      })
      .select('*')
      .single()

    if (insertErr) {
      // Race: another request may have created it
      const { data: retry, error: retryErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (retryErr) throw retryErr
      if (!retry) throw insertErr
      setProfile(retry as Profile)
      return retry as Profile
    }

    setProfile(created as Profile)
    return created as Profile
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    await loadProfile(session.user.id, session.user)
  }, [loadProfile, session?.user])

  useEffect(() => {
    const supabase = tryGetSupabase()
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) {
        loadProfile(data.session.user.id, data.session.user)
          .catch(console.error)
          .finally(() => {
            if (mounted) setLoading(false)
          })
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }
      if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false)
      }
      setSession(next)
      if (next?.user) {
        loadProfile(next.user.id, next.user).catch(console.error)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(
    async (input: { email: string; password: string; name: string; username: string }) => {
      const { error } = await getSupabase().auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            name: input.name,
            username: input.username,
          },
        },
      })
      if (error) throw error
    },
    [],
  )

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }, [])

  const signInWithOAuth = useCallback(async (provider: 'google' | 'github') => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // GitHub: read email for account linking / profile
        scopes: provider === 'github' ? 'read:user user:email' : undefined,
      },
    })
    if (error) throw error
  }, [])

  const linkOAuthProvider = useCallback(async (provider: 'google' | 'github') => {
    const { error } = await getSupabase().auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: provider === 'github' ? 'read:user user:email' : undefined,
      },
    })
    if (error) throw error
  }, [])

  const unlinkOAuthIdentity = useCallback(async (identity: UserIdentity) => {
    const supabase = getSupabase()
    // API expects identity_id (not only provider); pass through as returned by user.identities
    const { data: unlinkData, error } = await supabase.auth.unlinkIdentity(identity)
    if (error) throw error
    if (unlinkData === false || unlinkData == null) {
      // Some clients return null/false without error — treat as failure
      // (still try refresh below)
    }
    // JWT may still list old identities until refresh — force a new session
    const { data: refreshed, error: rErr } = await supabase.auth.refreshSession()
    if (rErr) {
      // Fallback: getUser after refresh failure
      const { data: u, error: uErr } = await supabase.auth.getUser()
      if (uErr) throw uErr
      if (u.user) {
        setSession((prev) => (prev ? { ...prev, user: u.user! } : prev))
      }
      return
    }
    if (refreshed.session) {
      setSession(refreshed.session)
    }
  }, [])

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(
    async (input: { newPassword: string; currentPassword?: string }) => {
      const supabase = getSupabase()
      const newPassword = input.newPassword
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters')
      }

      // When changing while already signed in, verify the current password first.
      if (input.currentPassword != null && input.currentPassword !== '') {
        const email = session?.user?.email
        if (!email) throw new Error('Not signed in')
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email,
          password: input.currentPassword,
        })
        if (reauthError) throw new Error('Current password is incorrect')
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordRecovery(false)
    },
    [session?.user?.email],
  )

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw error
    setProfile(null)
    setPasswordRecovery(false)
  }, [])

  const updateProfile = useCallback(
    async (
      patch: Partial<Pick<Profile, 'name' | 'username' | 'theme' | 'github_integration_enabled'>>,
    ) => {
      if (!session?.user?.id) throw new Error('Not signed in')
      const { data, error } = await getSupabase()
        .from('profiles')
        .update(patch)
        .eq('id', session.user.id)
        .select('*')
        .single()
      if (error) throw error
      setProfile(data as Profile)
    },
    [session?.user?.id],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      passwordRecovery,
      clearPasswordRecovery,
      refreshProfile,
      signInWithPassword,
      signUp,
      signInWithMagicLink,
      signInWithOAuth,
      linkOAuthProvider,
      unlinkOAuthIdentity,
      resetPasswordForEmail,
      updatePassword,
      signOut,
      updateProfile,
    }),
    [
      loading,
      session,
      profile,
      passwordRecovery,
      clearPasswordRecovery,
      refreshProfile,
      signInWithPassword,
      signUp,
      signInWithMagicLink,
      signInWithOAuth,
      linkOAuthProvider,
      unlinkOAuthIdentity,
      resetPasswordForEmail,
      updatePassword,
      signOut,
      updateProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useProfileThemeSync(
  setTheme: (t: ThemePref) => void,
  profileTheme: ThemePref | undefined,
) {
  useEffect(() => {
    if (profileTheme) setTheme(profileTheme)
  }, [profileTheme, setTheme])
}

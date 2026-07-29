import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured, tryGetSupabase } from '@/lib/supabase/client'
import type { Profile, ThemePref } from '@/lib/supabase/types'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUp: (input: {
    email: string
    password: string
    name: string
    username: string
  }) => Promise<void>
  signInWithMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (patch: Partial<Pick<Profile, 'name' | 'username' | 'theme' | 'github_integration_enabled'>>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async (userId: string, user?: User | null) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    if (data) {
      setProfile(data as Profile)
      return data as Profile
    }

    // Profile missing (trigger skipped / user created before migration) — create one.
    const email = user?.email ?? ''
    const meta = user?.user_metadata ?? {}
    const baseUsername = String(meta.username || email.split('@')[0] || 'user')
      .replace(/[^A-Za-z0-9_.-]/g, '_')
      .slice(0, 70)
    const username = baseUsername.length >= 2 ? baseUsername : `user_${userId.slice(0, 6)}`
    const name = String(meta.name || username).slice(0, 80) || username

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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
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
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw error
    setProfile(null)
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
      refreshProfile,
      signInWithPassword,
      signUp,
      signInWithMagicLink,
      signOut,
      updateProfile,
    }),
    [
      loading,
      session,
      profile,
      refreshProfile,
      signInWithPassword,
      signUp,
      signInWithMagicLink,
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

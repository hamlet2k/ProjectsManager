import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient<Database> | null = null

export function getSupabase(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env',
    )
  }
  if (!client) {
    client = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

/** Soft access for UI that should degrade when env is missing */
export function tryGetSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null
  return getSupabase()
}

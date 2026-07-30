// Supabase Edge Function: store / status / delete GitHub PATs
// Secrets: GITHUB_TOKEN_SECRET (min 16 chars) — used for AES-GCM key derivation
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('projects-manager-github-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptToken(token: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token))
  const packed = new Uint8Array(iv.length + cipher.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(cipher), iv.length)
  return btoa(String.fromCharCode(...packed))
}

export async function decryptToken(payload: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
  const iv = raw.slice(0, 12)
  const data = raw.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = Deno.env.get('GITHUB_TOKEN_SECRET')
    if (!secret || secret.length < 16) {
      return json({ error: 'GITHUB_TOKEN_SECRET is not configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    if (action === 'status') {
      const { data, error } = await admin
        .from('github_credentials')
        .select('token_hint')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) return json({ error: error.message }, 400)
      return json({
        configured: Boolean(data),
        token_hint: data?.token_hint ?? null,
      })
    }

    if (action === 'save') {
      const token = String(body.token ?? '').trim()
      if (!token) return json({ error: 'token required' }, 400)
      // Quick validation against GitHub before storing
      const probe = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!probe.ok) {
        const t = await probe.text()
        return json(
          {
            error:
              probe.status === 401
                ? 'GitHub rejected this token. Use a classic PAT (repo scope) or fine-grained PAT with repository + Issues access.'
                : `GitHub validation failed (${probe.status}): ${t.slice(0, 200)}`,
          },
          400,
        )
      }
      const me = (await probe.json()) as { login?: string }
      const token_encrypted = await encryptToken(token, secret)
      const token_hint = token.slice(-4)
      const { error } = await admin.from('github_credentials').upsert({
        user_id: user.id,
        token_encrypted,
        token_hint,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true, token_hint, login: me.login ?? null })
    }

    if (action === 'delete') {
      const { error } = await admin.from('github_credentials').delete().eq('user_id', user.id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})

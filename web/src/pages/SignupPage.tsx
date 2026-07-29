import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'

export function SignupPage() {
  const { signUp, user, loading } = useAuth()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <PageLoader />
  if (user) return <Navigate to="/" replace />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Join to create scopes and share them with family.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          setInfo(null)
          try {
            await signUp({ email, password, name, username })
            setInfo('Account created. You may need to confirm your email before signing in.')
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign up failed')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Name" htmlFor="name">
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Username" htmlFor="username">
          <Input
            id="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="[A-Za-z0-9_\-\.]{2,80}"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        {info ? <p className="text-sm text-[var(--color-success)]">{info}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Sign up'}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-muted)]">
        Already have an account?{' '}
        <Link className="text-[var(--color-primary)] hover:underline" to="/login">
          Sign in
        </Link>
      </p>
    </div>
  )
}

import { Lock, LogOut } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { integrationConfig } from '../config/integrations'
import { isSupabaseConfigured, supabase } from '../services/supabaseClient'

export function AuthGate({ children }: { children: ReactNode }) {
  const enabled = integrationConfig.authProvider === 'supabase'
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled || !supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [enabled])

  if (!enabled) return <>{children}</>

  if (!isSupabaseConfigured || !supabase) {
    return (
      <AuthShell>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          La autenticacion protegida esta activada, pero faltan `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
        </p>
      </AuthShell>
    )
  }

  const client = supabase

  if (loading) {
    return (
      <AuthShell>
        <p className="text-sm text-slate-600 dark:text-slate-300">Verificando sesion...</p>
      </AuthShell>
    )
  }

  if (!session) {
    const submit = async (event: FormEvent) => {
      event.preventDefault()
      setError('')
      const { error: authError } = await client.auth.signInWithPassword({ email, password })
      if (authError) setError(authError.message)
    }

    return (
      <AuthShell>
        <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
          <button className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
            Entrar
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Acceso privado. Las cuentas se habilitan desde el panel administrador.
        </p>
      </AuthShell>
    )
  }

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <span className="truncate text-slate-600 dark:text-slate-300">Sesion activa: {session.user.email}</span>
          <button
            type="button"
            onClick={() => void client.auth.signOut()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-teal-700 p-2 text-white">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700 dark:text-teal-300">Protocolo Apuestas</p>
            <h1 className="text-xl font-bold">Acceso privado</h1>
          </div>
        </div>
        {children}
      </section>
    </main>
  )
}

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const projectRoot = process.cwd()
loadEnv(path.join(projectRoot, '.env'))

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL/VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env local.')
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))

if (args.help || !args.email) {
  printHelp()
  process.exit(args.help ? 0 : 1)
}

const allowedRoles = new Set(['admin', 'analyst', 'subscriber'])
const allowedPlans = new Set(['free', 'premium', 'pro'])
const allowedStatuses = new Set(['trialing', 'active', 'past_due', 'canceled', 'none'])

const role = args.role || 'admin'
const plan = args.plan || (role === 'subscriber' ? 'premium' : 'premium')
const status = args.status || 'active'

if (!allowedRoles.has(role)) fail(`Rol invalido: ${role}`)
if (!allowedPlans.has(plan)) fail(`Plan invalido: ${plan}`)
if (!allowedStatuses.has(status)) fail(`Estado invalido: ${status}`)

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const email = String(args.email).trim().toLowerCase()
let user = await findUserByEmail(email)

if (!user && args.create) {
  const password = process.env.SUPABASE_NEW_USER_PASSWORD
  if (!password) {
    fail('Para crear usuario desde CLI define SUPABASE_NEW_USER_PASSWORD en tu entorno local. No lo pongas en Git.')
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) fail(`No se pudo crear usuario Auth: ${error.message}`)
  user = data.user
}

if (!user) {
  fail(`No encontre usuario Auth con email ${email}. Crealo primero en Supabase Authentication o usa --create con SUPABASE_NEW_USER_PASSWORD local.`)
}

const profilePayload = {
  id: user.id,
  email: user.email || email,
  role,
  plan,
  subscription_status: status,
  updated_at: new Date().toISOString(),
}

const { error: profileError } = await supabase
  .from('profiles')
  .upsert(profilePayload, { onConflict: 'id' })

if (profileError) fail(`No se pudo actualizar profiles: ${profileError.message}`)

const subscriptionPayload = {
  user_id: user.id,
  provider: 'manual',
  plan,
  status,
  updated_at: new Date().toISOString(),
}

const { data: existingSubscriptions, error: subscriptionReadError } = await supabase
  .from('subscriptions')
  .select('id')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(1)

if (subscriptionReadError) fail(`No se pudo leer subscriptions: ${subscriptionReadError.message}`)

if (existingSubscriptions?.[0]?.id) {
  const { error } = await supabase
    .from('subscriptions')
    .update(subscriptionPayload)
    .eq('id', existingSubscriptions[0].id)
  if (error) fail(`No se pudo actualizar subscription: ${error.message}`)
} else {
  const { error } = await supabase
    .from('subscriptions')
    .insert(subscriptionPayload)
  if (error) fail(`No se pudo crear subscription: ${error.message}`)
}

console.log(`Acceso actualizado para ${email}`)
console.log(`user_id: ${user.id}`)
console.log(`role: ${role}`)
console.log(`plan: ${plan}`)
console.log(`subscription_status: ${status}`)

function loadEnv(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 1) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--') continue
    if (value === '--help' || value === '-h') parsed.help = true
    else if (value === '--create') parsed.create = true
    else if (value.startsWith('--')) {
      const key = value.slice(2)
      parsed[key] = values[index + 1]
      index += 1
    }
  }
  return parsed
}

async function findUserByEmail(targetEmail) {
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) fail(`No se pudo listar usuarios Auth: ${error.message}`)
    const found = data.users.find((item) => item.email?.toLowerCase() === targetEmail)
    if (found) return found
    if (data.users.length < perPage) return null
    page += 1
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function printHelp() {
  console.log(`
Uso:
  pnpm run supabase:grant-access -- --email usuario@dominio.com --role admin --plan premium --status active

Crear usuario Auth desde CLI, usando password solo en variable local:
  $env:SUPABASE_NEW_USER_PASSWORD="password-temporal"
  pnpm run supabase:grant-access -- --email usuario@dominio.com --role admin --plan premium --status active --create

Valores:
  --role    admin | analyst | subscriber
  --plan    free | premium | pro
  --status  trialing | active | past_due | canceled | none
`)
}

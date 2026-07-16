import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const projectRoot = process.cwd()
loadEnv(path.join(projectRoot, '.env'))
loadEnv(path.resolve(projectRoot, '..', 'APUESTAS', '.env'), false)

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const snapshotPath = process.env.SETTLEMENT_SNAPSHOT_PATH || path.join(projectRoot, 'public', 'settlements', 'latest.json')

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL/VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env local.')
  process.exit(1)
}

if (!existsSync(snapshotPath)) {
  console.error(`No existe el snapshot ${snapshotPath}. Ejecuta npm run settlement:snapshot primero.`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

function loadEnv(filePath, override = false) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 1) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (override || process.env[key] === undefined) process.env[key] = value
  }
}

function eventDateFromKey(key) {
  const match = String(key).match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function matchFromKey(key) {
  return String(key).split('|')[2] || 'No disponible'
}

function selectionFromKey(key) {
  return String(key).split('|')[3] || 'No disponible'
}

async function main() {
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  const rows = (snapshot.settlements ?? []).map((settlement) => ({
    pick_key: settlement.key,
    event_date: eventDateFromKey(settlement.key),
    match_name: matchFromKey(settlement.key),
    selection: selectionFromKey(settlement.key),
    settlement: settlement.settlement,
    reason: settlement.reason ?? null,
    fixture: settlement.fixture ?? null,
    source: settlement.source ?? 'local',
    settled_at: snapshot.generatedAt ?? new Date().toISOString(),
  }))

  if (!rows.length) {
    console.log('No hay resultados para importar.')
    return
  }

  const { error } = await supabase.from('settlements').upsert(rows, { onConflict: 'pick_key' })
  if (error) throw new Error(`No se pudieron importar settlements: ${error.message}`)

  console.log(`${rows.length} resultados importados a Supabase.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

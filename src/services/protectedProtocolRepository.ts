import { processRawPick, type ProcessedPick, type RawPickRow } from '../domain/pickProcessing'
import { supabase } from './supabaseClient'

interface ProtectedPickRow {
  id: string
  league: string | null
  raw_payload: RawPickRow
}

export async function fetchProtectedProtocolPicks(): Promise<ProcessedPick[]> {
  if (!supabase) throw new Error('Supabase no esta configurado.')

  const { data, error } = await supabase
    .from('picks')
    .select('id, league, raw_payload')
    .order('event_date', { ascending: false })
    .order('event_time', { ascending: true })
    .limit(10000)

  if (error) throw new Error(`No se pudo leer la base protegida: ${error.message}`)

  return ((data ?? []) as ProtectedPickRow[]).map((row, index) => ({
    ...processRawPick({ ...row.raw_payload, league: row.raw_payload?.league ?? row.league ?? undefined }, index),
    id: row.id,
  }))
}

interface ProtectedSettlementRow {
  pick_key: string
  settlement: string
  source: string
  reason: string | null
  fixture: unknown
}

export async function fetchProtectedSettlements() {
  if (!supabase) throw new Error('Supabase no esta configurado.')

  const { data, error } = await supabase
    .from('settlements')
    .select('pick_key, settlement, source, reason, fixture')
    .limit(20000)

  if (error) throw new Error(`No se pudieron leer resultados protegidos: ${error.message}`)

  return {
    settlements: ((data ?? []) as ProtectedSettlementRow[]).map((row) => ({
      key: row.pick_key,
      settlement: row.settlement,
      source: row.source,
      reason: row.reason ?? undefined,
      fixture: row.fixture,
    })),
    requestSummary: {
      uniqueMatches: 0,
      fixtureLookups: 0,
      fixtureStatistics: 0,
      fixtureEvents: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiRequests: 0,
      estimatedExtraRequestsPerMatch: 0,
      maxRecommendedRequestsPerMatch: 3,
    },
  }
}

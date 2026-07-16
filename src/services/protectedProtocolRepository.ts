import { processRawPick, type ProcessedPick, type RawPickRow } from '../domain/pickProcessing'
import { supabase } from './supabaseClient'

interface ProtectedPickRow {
  id: string
  raw_payload: RawPickRow
}

export async function fetchProtectedProtocolPicks(): Promise<ProcessedPick[]> {
  if (!supabase) throw new Error('Supabase no esta configurado.')

  const { data, error } = await supabase
    .from('picks')
    .select('id, raw_payload')
    .order('event_date', { ascending: false })
    .order('event_time', { ascending: true })
    .limit(10000)

  if (error) throw new Error(`No se pudo leer la base protegida: ${error.message}`)

  return ((data ?? []) as ProtectedPickRow[]).map((row, index) => ({
    ...processRawPick(row.raw_payload, index),
    id: row.id,
  }))
}

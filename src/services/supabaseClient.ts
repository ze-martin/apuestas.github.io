import { createClient } from '@supabase/supabase-js'
import { integrationConfig } from '../config/integrations'

export const isSupabaseConfigured = Boolean(integrationConfig.supabaseUrl && integrationConfig.supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(integrationConfig.supabaseUrl, integrationConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

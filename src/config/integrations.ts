export type DataSourceMode = 'github-pages' | 'local' | 'api' | 'supabase'
export type AuthProvider = 'none' | 'supabase' | 'auth0' | 'clerk' | 'custom'

function readEnv(key: string, fallback = '') {
  const value = import.meta.env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export const integrationConfig = {
  dataSourceMode: readEnv('VITE_DATA_SOURCE_MODE', 'github-pages') as DataSourceMode,
  protocolIndexUrl: readEnv('VITE_PROTOCOL_INDEX_URL', 'https://ze-martin.github.io/'),
  protocolApiUrl: readEnv('VITE_PROTOCOL_API_URL'),
  sportsApiUrl: readEnv('VITE_SPORTS_API_URL'),
  supabaseUrl: readEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
  authProvider: readEnv('VITE_AUTH_PROVIDER', 'none') as AuthProvider,
  authIssuerUrl: readEnv('VITE_AUTH_ISSUER_URL'),
  databaseProvider: readEnv('VITE_DATABASE_PROVIDER', 'localStorage'),
}

export const integrationRoadmap = [
  {
    label: 'Datos del protocolo',
    current:
      integrationConfig.dataSourceMode === 'github-pages'
        ? 'GitHub Pages'
        : integrationConfig.dataSourceMode === 'api'
          ? 'API configurada'
          : integrationConfig.dataSourceMode === 'supabase'
            ? 'Supabase protegido'
            : 'Local JSON/CSV',
    readyFor: 'Reportes HTML, endpoints REST/GraphQL o archivos JSON/CSV',
  },
  {
    label: 'APIs deportivas',
    current: integrationConfig.sportsApiUrl ? 'URL configurada' : 'No conectada',
    readyFor: 'Fixtures, lesiones, cuotas, resultados y cierre de mercado',
  },
  {
    label: 'Persistencia',
    current: integrationConfig.databaseProvider,
    readyFor: 'PostgreSQL, Supabase, Firebase o API propia',
  },
  {
    label: 'Autenticacion',
    current: integrationConfig.authProvider === 'none' ? 'Sin login' : integrationConfig.authProvider,
    readyFor: 'Roles de analista, supervisor y solo lectura',
  },
]

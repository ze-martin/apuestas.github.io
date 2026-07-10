export type ConfidenceLevel = 'Alta' | 'Media' | 'Baja' | 'No disponible'
export type RiskLevel = 'Bajo' | 'Medio' | 'Alto' | 'No disponible'
export type PickStatus = 'Pendiente' | 'Acertado' | 'Fallado' | 'Void' | 'Descartado'
export type FinalRecommendation =
  | 'Tomar'
  | 'Tomar con cautela'
  | 'Esperar mejor cuota'
  | 'Descartar'
  | 'No disponible'

export interface ProtocolPrediction {
  id: string
  source: 'mock' | 'imported' | 'manual'
  date: string
  time: string
  sport: string
  league: string
  event: string
  market: string
  selection: string
  odds: number | null
  estimatedProbability: number | null
  confidence: ConfidenceLevel
  risk: RiskLevel
  stake: number | null
  recommendation: FinalRecommendation
  mainReason: string
  factorsFor: string[]
  factorsAgainst: string[]
  alerts: string[]
  status: PickStatus
  result: string | null
  profitLoss: number | null
  protocolResult: string
  observations: string
  explanation: {
    recentForm?: string
    injuries?: string
    venue?: string
    keyStats?: string
    marketTrend?: string
    oddsMovement?: string
    headToHead?: string
    motivation?: string
    risks?: string
    invalidators?: string
  }
  raw: Record<string, unknown>
}

export interface Filters {
  date: string
  sport: string
  league: string
  market: string
  confidence: string
  risk: string
  status: string
  query: string
}

export type SortKey = 'date' | 'confidence' | 'edge' | 'odds' | 'league' | 'risk'
export type StakeMode = 'fixed' | 'kelly'

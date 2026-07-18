import Papa from 'papaparse'

export type MarketType =
  | 'goals'
  | 'first_half_goals'
  | 'corners'
  | 'cards'
  | 'btts'
  | 'winner'
  | 'draw_no_bet'
  | 'shots'
  | 'other'

export type MarketSide = 'home' | 'away' | 'total' | 'none'
export type MarketDirection = 'over' | 'under' | 'yes' | 'no' | 'home' | 'away' | 'none'
export type RiskTier = 'Bajo' | 'Medio' | 'Alto'
export type Confidence = 'Alta' | 'Media' | 'Baja' | 'No disponible'

export interface RawPickRow {
  fecha?: string
  hora?: string
  partido?: string
  league?: string
  liga?: string
  competition?: string
  competicion?: string
  bookmaker?: string
  bookmaker_api?: string
  bookmaker_betano?: string
  pick?: string
  market_original?: string
  probabilidad?: string
  prob_num?: string | number
  cuota?: string | number
  cuota_api?: string | number
  cuota_betano?: string | number
  ev?: string
  ev_num?: string | number
  ev_api?: string | number
  ev_betano?: string | number
  estado?: string
  estado_api?: string
  estado_betano?: string
  confianza?: string
  fuente?: string
  razon?: string
  riesgo?: string
  [key: string]: unknown
}

export interface ProcessedPick {
  id: string
  fecha: string
  hora: string
  partido: string
  league: string
  bookmaker: string
  bookmakerApi: string
  bookmakerBetano: string
  preferredBookmaker: string
  pick: string
  marketOriginal: string
  probability: number
  probabilityPct: number
  odds: number | null
  oddsApi: number | null
  oddsBetano: number | null
  ev: number | null
  evApi: number | null
  evBetano: number | null
  estado: string
  estadoApi: string
  estadoBetano: string
  confianza: Confidence
  fuente: string
  razon: string
  riesgoOriginal: string
  hasOdds: boolean
  hasApiOdds: boolean
  hasBetanoOdds: boolean
  isPositiveEV: boolean
  isPositiveApiEV: boolean
  isPositiveBetanoEV: boolean
  impliedProbability: number | null
  edge: number | null
  edgePct: number | null
  pickScore: number
  riskTier: RiskTier
  marketType: MarketType
  side: MarketSide
  direction: MarketDirection
  line: number | null
  correlationGroup: string
  isInformational: boolean
  raw: RawPickRow
}

export interface PickFilters {
  fecha: string
  league: string
  partido: string
  marketType: string
  riskTier: string
  evOnly: boolean
  minOdds: string
  maxOdds: string
  minProbability: string
  query: string
}

const confidenceWeights: Record<Confidence, number> = {
  Alta: 1,
  Media: 0.65,
  Baja: 0.35,
  'No disponible': 0,
}

function text(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function normalizeKey(key: string) {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstField(row: RawPickRow, keys: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const)
  for (const key of keys) {
    const direct = row[key]
    if (direct !== null && direct !== undefined && text(direct) !== '') return direct
    const normalizedKey = normalizeKey(key)
    const normalized = normalizedEntries.find(([entryKey, value]) => entryKey === normalizedKey && text(value) !== '')
    if (normalized) return normalized[1]
  }
  return undefined
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).replace('%', '').replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseProbability(value: unknown): number {
  const parsed = parseNumber(value)
  if (parsed === null) return 0
  if (parsed > 1) return parsed / 100
  return Math.max(0, parsed)
}

function normalizeConfidence(value: unknown): Confidence {
  const normalized = text(value).toLowerCase()
  if (normalized.includes('alta')) return 'Alta'
  if (normalized.includes('media')) return 'Media'
  if (normalized.includes('baja')) return 'Baja'
  return 'No disponible'
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value))
}

export function normalizeMarket(input: string) {
  const raw = input.trim()
  const value = raw.toLowerCase()
  const signedLine = value.match(/[+-]\s*(\d+(?:[.,]\d+)?)/)?.[1]
  const namedLine = value.match(/(?:over|under)[.\s]*(\d+(?:[.,]\d+)?)/)?.[1]
  const line = parseNumber(signedLine ?? namedLine ?? value.match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? null)

  let marketType: MarketType = 'other'
  if (value.includes('1t') || value.includes('primer tiempo') || value.includes('first half')) marketType = 'first_half_goals'
  else if (value.includes('corner')) marketType = 'corners'
  else if (value.includes('tarjeta') || value.includes('card')) marketType = 'cards'
  else if (value.includes('btts') || value.includes('ambos')) marketType = 'btts'
  else if (value.includes('dnb') || value.includes('draw no bet')) marketType = 'draw_no_bet'
  else if (value.includes('shot') || value.includes('tiro')) marketType = 'shots'
  else if (value.includes('1x2') || value.includes('gana local') || value.includes('gana visita')) marketType = 'winner'
  else if (value.includes('gol') || value.includes('goal') || value.includes('team_total')) marketType = 'goals'

  let side: MarketSide = 'none'
  if (value.includes('local') || value.includes('home') || value.includes('team_total_home')) side = 'home'
  else if (value.includes('visita') || value.includes('away') || value.includes('team_total_away')) side = 'away'
  else if (marketType !== 'winner' && marketType !== 'draw_no_bet') side = 'total'

  let direction: MarketDirection = 'none'
  if (value.includes('+') || value.includes('over')) direction = 'over'
  else if (value.includes('-') || value.includes('under')) direction = 'under'
  else if (value.includes('sí') || value.includes('si') || value.includes('yes')) direction = 'yes'
  else if (value.includes(' no') || value.endsWith('no')) direction = 'no'
  else if (value.includes('local') || value.includes('home')) direction = 'home'
  else if (value.includes('visita') || value.includes('away')) direction = 'away'

  return {
    marketType,
    side,
    direction,
    line,
    correlationGroup: `${marketType}:${side}:${direction}`,
  }
}

export function classifyRisk(probability: number, ev: number | null, odds: number | null): RiskTier {
  if ((odds ?? 0) >= 3 || probability < 0.65) return 'Alto'
  if (probability >= 0.8 && (ev ?? 0) > 0) return 'Bajo'
  if (probability >= 0.65 && probability < 0.8 && (ev ?? 0) > 0) return 'Medio'
  return 'Alto'
}

export function processRawPick(row: RawPickRow, index: number): ProcessedPick {
  const pick = text(row.pick || row.market_original || row.partido, 'No disponible')
  const marketOriginal = text(row.market_original || row.pick, pick)
  const league = text(firstField(row, ['league', 'liga', 'competition', 'competicion', 'torneo', 'campeonato']), 'Liga no disponible')
  const probability = parseProbability(row.prob_num ?? row.probabilidad)
  const genericOdds = parseNumber(firstField(row, ['cuota', 'odds']))
  const genericEv = parseNumber(firstField(row, ['ev_num', 'ev']))
  const oddsApi = parseNumber(firstField(row, ['cuota_api', 'odds_api', 'cuota_10bet_api', 'cuota 10bet/api'])) ?? genericOdds
  const oddsBetano = parseNumber(firstField(row, ['cuota_betano', 'odds_betano', 'cuota betano']))
  const evApi = parseNumber(firstField(row, ['ev_api', 'ev_10bet_api', 'ev 10bet/api'])) ?? genericEv
  const evBetano = parseNumber(firstField(row, ['ev_betano', 'ev betano']))
  const hasApiOdds = oddsApi !== null && oddsApi > 1
  const hasBetanoOdds = oddsBetano !== null && oddsBetano > 1
  const hasOdds = hasBetanoOdds || hasApiOdds || (genericOdds !== null && genericOdds > 1)
  const odds = hasBetanoOdds ? oddsBetano : hasApiOdds ? oddsApi : genericOdds !== null && genericOdds > 1 ? genericOdds : null
  const ev = hasBetanoOdds ? evBetano : evApi ?? genericEv
  const impliedProbability = odds !== null ? 1 / odds : null
  const edge = impliedProbability === null ? null : probability - impliedProbability
  const confidence = normalizeConfidence(row.confianza)
  const bookmakerApi = text(firstField(row, ['bookmaker_api', 'book_api', 'book 10bet/api']), text(row.bookmaker, '10Bet/API'))
  const bookmakerBetano = text(firstField(row, ['bookmaker_betano', 'book_betano', 'book betano']), 'Betano')
  const preferredBookmaker = hasBetanoOdds ? bookmakerBetano : hasApiOdds ? bookmakerApi : text(row.bookmaker, 'No disponible')
  const estadoApi = text(firstField(row, ['estado_api', 'estado 10bet/api']), text(row.estado, 'No disponible'))
  const estadoBetano = text(firstField(row, ['estado_betano', 'estado betano']), 'No disponible')
  const estado = hasBetanoOdds ? estadoBetano : estadoApi
  const isPositiveEV = (ev ?? 0) > 0
  const market = normalizeMarket(`${marketOriginal} ${pick}`)

  return {
    id: `${text(row.fecha, 'sin-fecha')}-${text(row.partido, 'sin-partido')}-${index}`,
    fecha: text(row.fecha, 'No disponible'),
    hora: text(row.hora, ''),
    partido: text(row.partido, 'No disponible'),
    league,
    bookmaker: preferredBookmaker,
    bookmakerApi,
    bookmakerBetano,
    preferredBookmaker,
    pick,
    marketOriginal,
    probability,
    probabilityPct: probability * 100,
    odds,
    oddsApi: hasApiOdds ? oddsApi : null,
    oddsBetano: hasBetanoOdds ? oddsBetano : null,
    ev,
    evApi,
    evBetano,
    estado,
    estadoApi,
    estadoBetano,
    confianza: confidence,
    fuente: text(row.fuente, 'No disponible'),
    razon: text(row.razon, 'No disponible'),
    riesgoOriginal: text(row.riesgo, 'No disponible'),
    hasOdds,
    hasApiOdds,
    hasBetanoOdds,
    isPositiveEV,
    isPositiveApiEV: (evApi ?? 0) > 0,
    isPositiveBetanoEV: (evBetano ?? 0) > 0,
    impliedProbability,
    edge,
    edgePct: edge === null ? null : edge * 100,
    pickScore: clampScore(probability * 45 + Math.max(edge ?? 0, 0) * 35 + confidenceWeights[confidence] * 20),
    riskTier: classifyRisk(probability, ev, hasOdds ? odds : null),
    marketType: market.marketType,
    side: market.side,
    direction: market.direction,
    line: market.line,
    correlationGroup: market.correlationGroup,
    isInformational: !hasOdds,
    raw: row,
  }
}

function parseHtmlReport(html: string): RawPickRow[] {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const title = document.querySelector('h1')?.textContent ?? ''
  const reportDate = title.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? 'No disponible'
  const reportLeague = inferLeagueFromTitle(title)
  const headers = Array.from(document.querySelectorAll('#markets thead th')).map((cell) => cell.textContent?.trim().toLowerCase() ?? '')
  const hasDualOddsSchema = headers.some((header) => header.includes('betano'))
  const cell = (row: Element, index: number) => row.children[index]?.textContent?.trim() ?? ''

  return Array.from(document.querySelectorAll('#markets tbody tr')).map((row) => {
    if (hasDualOddsSchema) {
      return {
        fecha: reportDate,
        hora: cell(row, 1),
        partido: cell(row, 2),
        league: row.getAttribute('data-league') ?? row.getAttribute('data-liga') ?? reportLeague,
        pick: cell(row, 3),
        market_original: cell(row, 3),
        probabilidad: cell(row, 4),
        prob_num: cell(row, 4),
        bookmaker: cell(row, 8) || cell(row, 5) || 'No disponible',
        bookmaker_api: cell(row, 5) || '10Bet/API',
        cuota_api: cell(row, 6),
        ev_api: row.getAttribute('data-ev-api') ?? cell(row, 7),
        bookmaker_betano: cell(row, 8) || 'Betano',
        cuota_betano: cell(row, 9),
        ev_betano: row.getAttribute('data-ev-betano') ?? cell(row, 10),
        estado_api: cell(row, 11),
        estado_betano: cell(row, 12),
        estado: cell(row, 12) || cell(row, 11),
        confianza: cell(row, 13),
        fuente: cell(row, 14),
        razon: cell(row, 14),
        riesgo: cell(row, 15),
      }
    }

    return {
      fecha: reportDate,
      hora: cell(row, 1),
      partido: cell(row, 2),
      league: row.getAttribute('data-league') ?? row.getAttribute('data-liga') ?? reportLeague,
      bookmaker: 'API-Football/10Bet',
      pick: cell(row, 3),
      market_original: cell(row, 3),
      probabilidad: cell(row, 4),
      prob_num: cell(row, 4),
      cuota: cell(row, 5),
      ev: cell(row, 6),
      ev_num: cell(row, 6),
      estado: cell(row, 7),
      confianza: cell(row, 8),
      fuente: cell(row, 9),
      razon: cell(row, 9),
      riesgo: cell(row, 10),
    }
  })
}

function inferLeagueFromTitle(title: string) {
  const normalized = text(title)
  const withoutDate = normalized.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '').replace(/\s+-\s*$/g, '').trim()
  const parts = withoutDate.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
  const candidate = [...parts].reverse().find((part) => !/protocolo|reporte|completo|dashboard/i.test(part))
  if (!candidate || /mundial\s+2026/i.test(candidate)) return 'Liga no disponible'
  return candidate
}

export function parseReportText(raw: string): Promise<ProcessedPick[]> {
  const content = raw.trim()
  if (!content) return Promise.resolve([])
  if (content.startsWith('<')) {
    return Promise.resolve(parseHtmlReport(content).map(processRawPick))
  }

  return new Promise((resolve, reject) => {
    Papa.parse<RawPickRow>(content, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data.map(processRawPick)),
      error: (error: Error) => reject(error),
    })
  })
}

export function filterPicks(picks: ProcessedPick[], filters: PickFilters) {
  const minOdds = parseNumber(filters.minOdds)
  const maxOdds = parseNumber(filters.maxOdds)
  const minProbability = parseProbability(filters.minProbability || 0)
  const query = filters.query.trim().toLowerCase()

  return picks.filter((pick) => {
    if (filters.fecha && pick.fecha !== filters.fecha) return false
    if (filters.league && pick.league !== filters.league) return false
    if (filters.partido && pick.partido !== filters.partido) return false
    if (filters.marketType && pick.marketType !== filters.marketType) return false
    if (filters.riskTier && pick.riskTier !== filters.riskTier) return false
    if (filters.evOnly && !pick.isPositiveEV) return false
    if (minOdds !== null && (pick.odds ?? 0) < minOdds) return false
    if (maxOdds !== null && (pick.odds ?? Number.POSITIVE_INFINITY) > maxOdds) return false
    if (pick.probability < minProbability) return false
    if (query && !`${pick.league} ${pick.partido} ${pick.pick} ${pick.marketOriginal}`.toLowerCase().includes(query)) return false
    return true
  })
}

export function groupByMatch(picks: ProcessedPick[]) {
  return picks.reduce<Record<string, ProcessedPick[]>>((acc, pick) => {
    const key = `${pick.fecha}|${pick.hora}|${pick.partido}`
    acc[key] = [...(acc[key] ?? []), pick]
    return acc
  }, {})
}

function isRedundantLine(a: ProcessedPick, b: ProcessedPick) {
  return (
    a.marketType === b.marketType &&
    a.side === b.side &&
    a.direction === b.direction &&
    a.line !== null &&
    b.line !== null
  )
}

export function createSuggestedParlay(picks: ProcessedPick[], maxLegs = 4) {
  const selected: ProcessedPick[] = []
  const candidates = picks
    .filter((pick) => pick.hasOdds && pick.isPositiveEV && pick.riskTier !== 'Alto')
    .sort((a, b) => {
      const riskA = a.riskTier === 'Bajo' ? 0 : 1
      const riskB = b.riskTier === 'Bajo' ? 0 : 1
      return b.probability - a.probability || riskA - riskB || b.pickScore - a.pickScore
    })

  for (const candidate of candidates) {
    if (selected.length >= maxLegs) break
    const sameGroup = selected.filter((pick) => pick.correlationGroup === candidate.correlationGroup).length
    if (sameGroup >= 2) continue
    if (selected.some((pick) => isRedundantLine(pick, candidate))) continue
    selected.push(candidate)
  }

  return selected
}

export function formatPct(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return 'N/D'
  return `${value.toFixed(digits)}%`
}

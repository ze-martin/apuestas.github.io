import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  CloudDownload,
  FileText,
  Link2,
  Loader2,
  Moon,
  Search,
  Sun,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  createSuggestedParlay,
  filterPicks,
  formatPct,
  groupByMatch,
  parseReportText,
  type MarketType,
  type PickFilters,
  type ProcessedPick,
} from '../domain/pickProcessing'

type MainView = 'main' | 'matches' | 'simulation' | 'guide' | 'userHistory' | 'actualHistory' | 'noOdds'
type SortKey = 'score' | 'edge' | 'probability' | 'ev' | 'odds' | 'risk'
type UrlMode = 'allReports' | 'latest' | 'direct'
type Settlement = 'Pendiente' | 'Acertado' | 'Fallado' | 'Devuelto' | 'Sin dato oficial'

interface SuggestedHistoryRecord {
  key: string
  fecha: string
  hora: string
  partido: string
  pick: ProcessedPick
  settlement: Settlement
  settlementSource: 'Reporte' | 'Manual' | 'API' | 'Pendiente'
  profit: number | null
  reason?: string
  fixture?: {
    id?: number | string
    status?: string
    score?: string
    halftime?: string
    home?: string
    away?: string
  } | null
}

const historyStorageKey = 'protocolo-apuestas:suggested-history:v1'
const actualSettlementsStorageKey = 'protocolo-apuestas:actual-settlements:v3'
const settlementSummaryStorageKey = 'protocolo-apuestas:settlement-summary:v3'

interface ApiSettlement {
  key: string
  settlement: Settlement
  source: string
  reason?: string
  fixture?: SuggestedHistoryRecord['fixture']
}

interface SettlementRequestSummary {
  uniqueMatches: number
  fixtureLookups: number
  fixtureStatistics: number
  fixtureEvents?: number
  cacheHits: number
  cacheMisses: number
  apiRequests: number
  estimatedExtraRequestsPerMatch: number
  maxRecommendedRequestsPerMatch: number
}

const defaultFilters: PickFilters = {
  fecha: '',
  partido: '',
  marketType: '',
  riskTier: '',
  evOnly: true,
  minOdds: '',
  maxOdds: '',
  minProbability: '0.70',
  query: '',
}

const marketLabels: Record<MarketType, string> = {
  goals: 'Goles',
  first_half_goals: 'Goles 1T',
  corners: 'Corners',
  cards: 'Tarjetas',
  btts: 'BTTS',
  winner: 'Ganador',
  draw_no_bet: 'DNB',
  shots: 'Tiros',
  other: 'Otros',
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort()
}

function uniqDates(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => b.localeCompare(a))
}

function absoluteUrl(href: string, baseUrl: string) {
  return new URL(href, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

function extractReportUrls(indexHtml: string, baseUrl: string) {
  const document = new DOMParser().parseFromString(indexHtml, 'text/html')
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter((href) => href.includes('reports/') && href.endsWith('.html'))
    .map((href) => absoluteUrl(href, baseUrl))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function inferDateFromSource(sourceLabel: string) {
  const match = sourceLabel.match(/(20\d{6})/)
  if (!match) return ''
  const raw = match[1]
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function applyDateFallback(picks: ProcessedPick[], sourceLabel: string) {
  const inferredDate = inferDateFromSource(sourceLabel)
  if (!inferredDate) return picks
  return picks.map((pick) => (pick.fecha === 'No disponible' ? { ...pick, fecha: inferredDate } : pick))
}

function riskClass(risk: string) {
  if (risk === 'Bajo') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
  if (risk === 'Medio') return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200'
  return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
}

function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${className}`}>{children}</span>
}

function sortPicks(picks: ProcessedPick[], sortKey: SortKey) {
  return [...picks].sort((a, b) => {
    if (sortKey === 'score') return b.pickScore - a.pickScore
    if (sortKey === 'edge') return (b.edge ?? -999) - (a.edge ?? -999)
    if (sortKey === 'probability') return b.probability - a.probability
    if (sortKey === 'ev') return (b.ev ?? -999) - (a.ev ?? -999)
    if (sortKey === 'odds') return (b.odds ?? 0) - (a.odds ?? 0)
    return a.riskTier.localeCompare(b.riskTier)
  })
}

function suggestedPickKey(pick: ProcessedPick) {
  return `${pick.fecha}|${pick.hora}|${pick.partido}|${pick.pick}|${pick.preferredBookmaker}`
}

function normalizeSettlement(value: string): Settlement | null {
  const normalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (normalized.includes('acert') || normalized.includes('ganad') || normalized.includes('win') || normalized.includes('won')) return 'Acertado'
  if (normalized.includes('fall') || normalized.includes('perdid') || normalized.includes('lost') || normalized.includes('loss')) return 'Fallado'
  if (normalized.includes('devuelt') || normalized.includes('void') || normalized.includes('push') || normalized.includes('cancel') || normalized.includes('anulad')) return 'Devuelto'
  if (normalized.includes('sin dato') || normalized.includes('no verificado') || normalized.includes('unverified') || normalized.includes('no official')) return 'Sin dato oficial'
  if (normalized.includes('pend')) return 'Pendiente'
  return null
}

function normalizeLooseKey(key: string) {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function rawPickValue(pick: ProcessedPick, keys: string[]) {
  const entries = Object.entries(pick.raw).map(([key, value]) => [normalizeLooseKey(key), value] as const)
  for (const key of keys) {
    const found = entries.find(([entryKey, value]) => entryKey === normalizeLooseKey(key) && value !== null && value !== undefined && String(value).trim() !== '')
    if (found) return String(found[1]).trim()
  }
  return ''
}

function pickActualOutcomeText(pick: ProcessedPick) {
  return [
    rawPickValue(pick, [
      'resultado_real',
      'resultado_pick',
      'resultado',
      'result',
      'outcome',
      'settlement',
      'settled',
      'status_resultado',
      'estado_resultado',
      'pick_result',
      'resultado_final',
    ]),
    pick.estado,
    pick.estadoBetano,
    pick.estadoApi,
  ].filter(Boolean).join(' ')
}

function settleProfit(settlement: Settlement, odds: number | null) {
  if (settlement === 'Acertado') return (odds ?? 1) - 1
  if (settlement === 'Fallado') return -1
  if (settlement === 'Devuelto') return 0
  return null
}

function buildSuggestedHistory(picks: ProcessedPick[], overrides: Record<string, Settlement>): SuggestedHistoryRecord[] {
  const groups = picks.reduce<Record<string, ProcessedPick[]>>((acc, pick) => {
    const key = `${pick.fecha}|${pick.partido}`
    acc[key] = [...(acc[key] ?? []), pick]
    return acc
  }, {})

  return Object.values(groups)
    .flatMap((matchPicks) => createSuggestedParlay(matchPicks, 4))
    .map((pick) => {
      const key = suggestedPickKey(pick)
      const reportSettlement = normalizeSettlement(pickActualOutcomeText(pick))
      const manualSettlement = normalizeSettlement(overrides[key] ?? '')
      const settlement = manualSettlement ?? reportSettlement ?? 'Pendiente'
      const settlementSource: SuggestedHistoryRecord['settlementSource'] = manualSettlement ? 'Manual' : reportSettlement ? 'Reporte' : 'Pendiente'
      const profit = settleProfit(settlement, pick.odds)
      return {
        key,
        fecha: pick.fecha,
        hora: pick.hora,
        partido: pick.partido,
        pick,
        settlement,
        settlementSource,
        profit,
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.hora.localeCompare(b.hora) || b.pick.pickScore - a.pick.pickScore)
}

function buildSuggestedActualHistory(picks: ProcessedPick[], apiSettlements: Record<string, ApiSettlement>): SuggestedHistoryRecord[] {
  const groups = picks.reduce<Record<string, ProcessedPick[]>>((acc, pick) => {
    const key = `${pick.fecha}|${pick.partido}`
    acc[key] = [...(acc[key] ?? []), pick]
    return acc
  }, {})

  return Object.values(groups)
    .flatMap((matchPicks) => createSuggestedParlay(matchPicks, 4))
    .map((pick) => {
      const key = suggestedPickKey(pick)
      const apiSettlement = apiSettlements[key]
      const settlement = normalizeSettlement(apiSettlement?.settlement ?? '') ?? normalizeSettlement(pickActualOutcomeText(pick)) ?? 'Pendiente'
      return {
        key,
        fecha: pick.fecha,
        hora: pick.hora,
        partido: pick.partido,
        pick,
        settlement,
        settlementSource: apiSettlement ? 'API' : settlement === 'Pendiente' ? 'Pendiente' : 'Reporte',
        profit: settleProfit(settlement, pick.odds),
        reason: apiSettlement?.reason,
        fixture: apiSettlement?.fixture,
      } satisfies SuggestedHistoryRecord
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.hora.localeCompare(b.hora) || b.pick.pickScore - a.pick.pickScore)
}

function summarizeHistory(records: SuggestedHistoryRecord[]) {
  const settled = records.filter((record) => record.settlement === 'Acertado' || record.settlement === 'Fallado' || record.settlement === 'Devuelto')
  const graded = records.filter((record) => record.settlement === 'Acertado' || record.settlement === 'Fallado')
  const won = records.filter((record) => record.settlement === 'Acertado').length
  const lost = records.filter((record) => record.settlement === 'Fallado').length
  const returned = records.filter((record) => record.settlement === 'Devuelto').length
  const noData = records.filter((record) => record.settlement === 'Sin dato oficial').length
  const pending = records.filter((record) => record.settlement === 'Pendiente').length
  const profit = settled.reduce((sum, record) => sum + (record.profit ?? 0), 0)
  return {
    total: records.length,
    settled: settled.length,
    won,
    lost,
    returned,
    noData,
    pending,
    hitRate: graded.length ? won / graded.length : null,
    profit,
    roi: settled.length ? profit / settled.length : null,
  }
}

function historyByDate(records: SuggestedHistoryRecord[]) {
  return Object.entries(
    records.reduce<Record<string, SuggestedHistoryRecord[]>>((acc, record) => {
      acc[record.fecha] = [...(acc[record.fecha] ?? []), record]
      return acc
    }, {}),
  ).sort(([a], [b]) => b.localeCompare(a))
}

function pickCsv(picks: ProcessedPick[]) {
  const headers = [
    'fecha',
    'hora',
    'partido',
    'bookmaker_preferido',
    'pick',
    'probability',
    'cuota_preferida',
    'ev_preferido',
    'cuota_betano',
    'ev_betano',
    'cuota_10bet_api',
    'ev_10bet_api',
    'edgePct',
    'score',
    'riesgo',
  ]
  const rows = picks.map((pick) => [
    pick.fecha,
    pick.hora,
    pick.partido,
    pick.preferredBookmaker,
    pick.pick,
    pick.probability.toFixed(4),
    pick.odds ?? '',
    pick.ev ?? '',
    pick.oddsBetano ?? '',
    pick.evBetano ?? '',
    pick.oddsApi ?? '',
    pick.evApi ?? '',
    pick.edgePct?.toFixed(2) ?? '',
    pick.pickScore.toFixed(1),
    pick.riskTier,
  ])
  return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatDecimal(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined ? 'N/D' : value.toFixed(digits)
}

function settlementEndpoint() {
  const configured = import.meta.env.VITE_SETTLEMENT_API_URL
  if (configured) return configured
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) return '/api/settlements'
  return ''
}

function todayInLima() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDateDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function activeSimulationDates(picks: ProcessedPick[]) {
  const available = new Set(picks.map((pick) => pick.fecha).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))
  const today = todayInLima()
  const windowDates = [today, addDateDays(today, 1), addDateDays(today, 2)]
  const inWindow = windowDates.filter((date) => available.has(date))
  if (inWindow.length) return inWindow
  return uniqDates([...available]).slice(0, 3).reverse()
}

function betanoOdds(pick: ProcessedPick) {
  return pick.oddsBetano && pick.oddsBetano > 1 ? pick.oddsBetano : null
}

function combinedOdds(picks: ProcessedPick[]) {
  const odds = picks.map(betanoOdds).filter((value): value is number => value !== null)
  if (!odds.length || odds.length !== picks.length) return null
  return odds.reduce((product, value) => product * value, 1)
}

function isRedundantSimulationLine(a: ProcessedPick, b: ProcessedPick) {
  return a.marketType === b.marketType && a.side === b.side && a.direction === b.direction && a.line !== null && b.line !== null
}

function createBetanoSuggestedParlay(picks: ProcessedPick[], maxLegs = 4) {
  const selected: ProcessedPick[] = []
  const candidates = picks
    .filter((pick) => betanoOdds(pick) !== null && pick.riskTier !== 'Alto' && (pick.evBetano ?? 0) > 0)
    .sort((a, b) => b.probability - a.probability || b.pickScore - a.pickScore)

  for (const candidate of candidates) {
    if (selected.length >= maxLegs) break
    const sameGroup = selected.filter((pick) => pick.correlationGroup === candidate.correlationGroup).length
    if (sameGroup >= 2) continue
    if (selected.some((pick) => isRedundantSimulationLine(pick, candidate))) continue
    selected.push(candidate)
  }

  return selected
}

export function ProcessedBettingDashboard() {
  const [picks, setPicks] = useState<ProcessedPick[]>([])
  const [filters, setFilters] = useState(defaultFilters)
  const [view, setView] = useState<MainView>('main')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [darkMode, setDarkMode] = useState(false)
  const [urlMode, setUrlMode] = useState<UrlMode>('allReports')
  const [sourceUrl, setSourceUrl] = useState('https://ze-martin.github.io')
  const [status, setStatus] = useState('Cargando reportes desde https://ze-martin.github.io...')
  const [loading, setLoading] = useState(false)
  const [historyOverrides, setHistoryOverrides] = useState<Record<string, Settlement>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = window.localStorage.getItem(historyStorageKey)
      return stored ? JSON.parse(stored) as Record<string, Settlement> : {}
    } catch {
      return {}
    }
  })
  const [actualSettlements, setActualSettlements] = useState<Record<string, ApiSettlement>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = window.localStorage.getItem(actualSettlementsStorageKey)
      return stored ? JSON.parse(stored) as Record<string, ApiSettlement> : {}
    } catch {
      return {}
    }
  })
  const [settlementSummary, setSettlementSummary] = useState<SettlementRequestSummary | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const stored = window.localStorage.getItem(settlementSummaryStorageKey)
      return stored ? JSON.parse(stored) as SettlementRequestSummary : null
    } catch {
      return null
    }
  })
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementError, setSettlementError] = useState('')
  const [simulationSelections, setSimulationSelections] = useState<Record<string, boolean>>({})
  const initialLoadStarted = useRef(false)
  const actualAutoRefreshStarted = useRef(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem(historyStorageKey, JSON.stringify(historyOverrides))
  }, [historyOverrides])

  useEffect(() => {
    localStorage.removeItem('protocolo-apuestas:actual-settlements:v1')
    localStorage.removeItem('protocolo-apuestas:settlement-summary:v1')
    localStorage.removeItem('protocolo-apuestas:actual-settlements:v2')
    localStorage.removeItem('protocolo-apuestas:settlement-summary:v2')
  }, [])

  useEffect(() => {
    localStorage.setItem(actualSettlementsStorageKey, JSON.stringify(actualSettlements))
  }, [actualSettlements])

  useEffect(() => {
    if (settlementSummary) localStorage.setItem(settlementSummaryStorageKey, JSON.stringify(settlementSummary))
  }, [settlementSummary])

  const loadText = useCallback(async (raw: string, sourceLabel: string) => {
    const parsed = applyDateFallback(await parseReportText(raw), sourceLabel)
    setPicks(parsed)
    setFilters(defaultFilters)
    setStatus(`${parsed.length} mercados procesados desde ${sourceLabel}.`)
  }, [])

  async function loadFile(file: File | null) {
    if (!file) return
    await loadText(await file.text(), file.name)
  }

  async function fetchText(url: string) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status} leyendo ${url}`)
    return response.text()
  }

  const loadUrl = useCallback(async () => {
    setLoading(true)
    try {
      if (urlMode === 'direct') {
        await loadText(await fetchText(sourceUrl), sourceUrl)
        return
      }

      const indexHtml = await fetchText(sourceUrl)
      const reportUrls = extractReportUrls(indexHtml, sourceUrl)
      if (!reportUrls.length) throw new Error(`No encontre enlaces reports/*.html en ${sourceUrl}`)

      const urlsToLoad = urlMode === 'latest' ? reportUrls.slice(0, 1) : reportUrls
      const reports = await Promise.all(
        urlsToLoad.map(async (url) => applyDateFallback(await parseReportText(await fetchText(url)), url)),
      )
      const merged = reports.flat()
      const availableDates = uniqDates(merged.map((pick) => pick.fecha)).join(', ')
      setPicks(merged)
      setFilters(defaultFilters)
      setStatus(`${merged.length} mercados procesados desde ${urlsToLoad.length} reporte(s). Fechas disponibles: ${availableDates}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo cargar la URL publica.')
    } finally {
      setLoading(false)
    }
  }, [loadText, sourceUrl, urlMode])

  useEffect(() => {
    if (initialLoadStarted.current) return
    initialLoadStarted.current = true
    void loadUrl()
  }, [loadUrl])

  const withOdds = useMemo(() => picks.filter((pick) => pick.hasOdds), [picks])
  const withoutOdds = useMemo(() => picks.filter((pick) => !pick.hasOdds), [picks])
  const withApiOdds = useMemo(() => picks.filter((pick) => pick.hasApiOdds), [picks])
  const withBetanoOdds = useMemo(() => picks.filter((pick) => pick.hasBetanoOdds), [picks])
  const simulationDates = useMemo(() => activeSimulationDates(picks), [picks])
  const simulationPicks = useMemo(
    () => picks.filter((pick) => pick.hasBetanoOdds && simulationDates.includes(pick.fecha)),
    [picks, simulationDates],
  )
  const filteredMain = useMemo(() => sortPicks(filterPicks(withOdds, filters), sortKey), [filters, sortKey, withOdds])
  const filteredInfo = useMemo(
    () => filterPicks(withoutOdds, { ...filters, evOnly: false, minOdds: '', maxOdds: '' }),
    [filters, withoutOdds],
  )
  const suggestedUserHistory = useMemo(() => buildSuggestedHistory(filteredMain, historyOverrides), [filteredMain, historyOverrides])
  const suggestedActualHistory = useMemo(() => buildSuggestedActualHistory(filteredMain, actualSettlements), [filteredMain, actualSettlements])

  const positiveEv = withOdds.filter((pick) => pick.isPositiveEV)
  const positiveApiEv = withApiOdds.filter((pick) => pick.isPositiveApiEV)
  const positiveBetanoEv = withBetanoOdds.filter((pick) => pick.isPositiveBetanoEV)
  const avgPositiveEv = positiveEv.length
    ? positiveEv.reduce((sum, pick) => sum + (pick.ev ?? 0), 0) / positiveEv.length
    : 0
  const bestEdge = withOdds.reduce<number | null>((best, pick) => {
    if (pick.edgePct === null) return best
    return best === null ? pick.edgePct : Math.max(best, pick.edgePct)
  }, null)
  const matches = uniq(picks.map((pick) => pick.partido))
  const dates = uniqDates(picks.map((pick) => pick.fecha))
  const marketTypes = uniq(picks.map((pick) => pick.marketType))
  const changeDate = (fecha: string) => setFilters({ ...defaultFilters, fecha })
  const resetFilters = () => setFilters(defaultFilters)
  const updateHistorySettlement = (key: string, settlement: Settlement) => {
    setHistoryOverrides((current) => ({ ...current, [key]: settlement }))
  }
  const toggleSimulationPick = (key: string) => {
    setSimulationSelections((current) => ({ ...current, [key]: !current[key] }))
  }
  const setSimulationMatchSelections = (keys: string[]) => {
    setSimulationSelections((current) => {
      const next = { ...current }
      for (const key of keys) next[key] = true
      return next
    })
  }
  const clearSimulationSelections = () => setSimulationSelections({})
  const refreshActualSettlements = useCallback(async (forceRefresh = false) => {
    const records = buildSuggestedActualHistory(filteredMain, {})
    setSettlementLoading(true)
    setSettlementError('')
    try {
      const endpoint = settlementEndpoint()
      if (!endpoint) {
        throw new Error('La liquidacion automatica requiere configurar VITE_SETTLEMENT_API_URL con un backend publico. GitHub Pages solo sirve el frontend estatico.')
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          forceRefresh,
          picks: records.map((record) => ({
            key: record.key,
            fecha: record.fecha,
            hora: record.hora,
            partido: record.partido,
            pick: record.pick.pick,
            marketType: record.pick.marketType,
            side: record.pick.side,
            direction: record.pick.direction,
            line: record.pick.line,
          })),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'No se pudo consultar API-Football.')
      const settlementMap = (payload.settlements as ApiSettlement[]).reduce<Record<string, ApiSettlement>>((acc, item) => {
        acc[item.key] = item
        return acc
      }, {})
      setActualSettlements(settlementMap)
      setSettlementSummary(payload.requestSummary as SettlementRequestSummary)
    } catch (error) {
      setSettlementError(error instanceof Error ? error.message : 'No se pudo actualizar el historial real.')
    } finally {
      setSettlementLoading(false)
    }
  }, [filteredMain])

  const recalculateActualSettlements = useCallback(() => {
    localStorage.removeItem(actualSettlementsStorageKey)
    localStorage.removeItem(settlementSummaryStorageKey)
    setActualSettlements({})
    setSettlementSummary(null)
    actualAutoRefreshStarted.current = false
    void refreshActualSettlements(true)
  }, [refreshActualSettlements])

  useEffect(() => {
    if (view !== 'actualHistory') return
    if (actualAutoRefreshStarted.current) return
    if (Object.keys(actualSettlements).length) return
    if (!filteredMain.length) return
    actualAutoRefreshStarted.current = true
    void refreshActualSettlements(false)
  }, [actualSettlements, filteredMain.length, refreshActualSettlements, view])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700 dark:text-teal-300">Dashboard Protocolo Apuestas</p>
            <h1 className="mt-1 text-2xl font-bold">Picks procesados por partido</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Fuente de cuotas: 10Bet/API y Betano cuando el reporte las incluye. Validar cuota en Betano antes de apostar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => download('picks-procesados.csv', pickCsv(filteredMain))}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <FileText className="h-4 w-4" />
              Exportar vista
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((value) => !value)}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {darkMode ? 'Claro' : 'Oscuro'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-5">
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:grid-cols-[1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-teal-700 dark:text-teal-300" />
              <h2 className="font-semibold">Carga de datos</h2>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                CSV local o HTML del reporte
                <input className="mt-2 block w-full text-sm" type="file" accept=".csv,.html,text/csv,text/html" onChange={(event) => void loadFile(event.target.files?.[0] ?? null)} />
              </label>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <p className="font-semibold text-slate-950 dark:text-white">Reglas activas</p>
                <p>Panel principal: solo mercados con cuota.</p>
                <p>Sin cuota: informativos en pestaña secundaria.</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <CloudDownload className="h-5 w-5 text-teal-700 dark:text-teal-300" />
              <h2 className="font-semibold">URL publica</h2>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]">
              <select
                value={urlMode}
                onChange={(event) => setUrlMode(event.target.value as UrlMode)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="allReports">Todos los reportes</option>
                <option value="latest">Ultimo reporte</option>
                <option value="direct">CSV/HTML directo</option>
              </select>
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                placeholder="https://ze-martin.github.io"
              />
              <button
                type="button"
                onClick={() => void loadUrl()}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Cargar
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{status}</p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <Kpi label="Partidos" value={matches.length.toString()} />
          <Kpi label="Con cuota 10Bet/API" value={withApiOdds.length.toString()} />
          <Kpi label="Con cuota Betano" value={withBetanoOdds.length.toString()} />
          <Kpi label="EV+ 10Bet/API" value={positiveApiEv.length.toString()} tone="green" />
          <Kpi label="EV+ Betano" value={positiveBetanoEv.length.toString()} tone="green" />
          <Kpi label="EV promedio positivo" value={avgPositiveEv.toFixed(2)} />
          <Kpi label="Mejor edge" value={bestEdge === null ? 'N/D' : `${bestEdge.toFixed(1)}%`} tone="green" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <Select label="Fecha" value={filters.fecha} onChange={changeDate} options={dates} />
            <Select label="Partido" value={filters.partido} onChange={(value) => setFilters({ ...filters, partido: value })} options={matches} />
            <Select
              label="Mercado"
              value={filters.marketType}
              onChange={(value) => setFilters({ ...filters, marketType: value })}
              options={marketTypes}
              formatter={(value) => marketLabels[value as MarketType] ?? value}
            />
            <Select label="Riesgo" value={filters.riskTier} onChange={(value) => setFilters({ ...filters, riskTier: value })} options={['Bajo', 'Medio', 'Alto']} />
            <Input label="Cuota min" value={filters.minOdds} onChange={(value) => setFilters({ ...filters, minOdds: value })} />
            <Input label="Cuota max" value={filters.maxOdds} onChange={(value) => setFilters({ ...filters, maxOdds: value })} />
            <Input label="Prob. min" value={filters.minProbability} onChange={(value) => setFilters({ ...filters, minProbability: value })} />
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">EV+</span>
              <label className="flex h-[38px] items-center gap-2 rounded-md border border-slate-300 px-3 dark:border-slate-700">
                <input type="checkbox" checked={filters.evOnly} onChange={(event) => setFilters({ ...filters, evOnly: event.target.checked })} />
                Solo EV+
              </label>
            </label>
          </div>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={filters.query}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              placeholder="Buscar partido, pick o mercado"
            />
          </label>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Limpiar filtros
          </button>
        </section>

        <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          <TabButton active={view === 'main'} onClick={() => setView('main')} label="Panel principal" count={filteredMain.length} />
          <TabButton active={view === 'matches'} onClick={() => setView('matches')} label="Vista por partido" count={Object.keys(groupByMatch(filteredMain)).length} />
          <TabButton active={view === 'simulation'} onClick={() => setView('simulation')} label="Simulacion Betano" count={Object.keys(groupByMatch(simulationPicks)).length} />
          <TabButton active={view === 'guide'} onClick={() => setView('guide')} label="Guia de decision" />
          <TabButton active={view === 'userHistory'} onClick={() => setView('userHistory')} label="Mi seguimiento" count={suggestedUserHistory.length} />
          <TabButton active={view === 'actualHistory'} onClick={() => setView('actualHistory')} label="Historial real" count={suggestedActualHistory.length} />
          <TabButton active={view === 'noOdds'} onClick={() => setView('noOdds')} label="Probabilidades sin cuota" count={filteredInfo.length} />
        </nav>

        {view === 'main' && (filteredMain.length ? <PicksTable picks={filteredMain} sortKey={sortKey} setSortKey={setSortKey} /> : <EmptyFilteredState onReset={resetFilters} />)}
        {view === 'matches' && (filteredMain.length ? <MatchCards picks={filteredMain} /> : <EmptyFilteredState onReset={resetFilters} />)}
        {view === 'simulation' && (
          <BetanoSimulation
            picks={simulationPicks}
            dates={simulationDates}
            selections={simulationSelections}
            onToggle={toggleSimulationPick}
            onUseRecommended={setSimulationMatchSelections}
            onClear={clearSimulationSelections}
          />
        )}
        {view === 'guide' && <DecisionGuide />}
        {view === 'userHistory' && <SuggestedHistoryView records={suggestedUserHistory} mode="user" onSettle={updateHistorySettlement} />}
        {view === 'actualHistory' && (
          <SuggestedHistoryView
            records={suggestedActualHistory}
            mode="actual"
            onRefreshActual={() => void refreshActualSettlements(true)}
            onRecalculateActual={recalculateActualSettlements}
            refreshLoading={settlementLoading}
            refreshError={settlementError}
            requestSummary={settlementSummary}
          />
        )}
        {view === 'noOdds' && <NoOddsTable picks={filteredInfo} />}

        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          Validar cuota en Betano antes de apostar. Las cuotas cargadas son referencia operativa del reporte y no garantizan disponibilidad final.
        </section>
      </main>
    </div>
  )
}

function Kpi({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone === 'green' ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{value}</p>
    </div>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
  formatter = (option) => option,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  formatter?: (option: string) => string
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatter(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" />
    </label>
  )
}

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`min-w-fit rounded-md px-3 py-2 text-sm font-semibold ${active ? 'bg-teal-700 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
      {label}{count !== undefined && <span className="opacity-75"> ({count})</span>}
    </button>
  )
}

function EvBadge({ value, positive }: { value: number | null; positive: boolean }) {
  return (
    <Badge className={positive ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}>
      {formatDecimal(value)}
    </Badge>
  )
}

function EmptyFilteredState({ onReset }: { onReset: () => void }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">No hay picks con los filtros actuales</h2>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            La fecha puede tener datos, pero algun filtro de partido, mercado, riesgo, cuota o busqueda esta reduciendo la vista.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800"
        >
          Limpiar filtros
        </button>
      </div>
    </section>
  )
}

function DecisionGuide() {
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-teal-700 dark:text-teal-300" />
          <h2 className="font-semibold">Guia de decision</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Esta guia explica las metricas del dashboard para decidir mejor. La app no garantiza ganancias; ayuda a detectar valor, riesgo y cuotas mal pagadas.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <GuideCard
          title="Confianza no es lo mismo que riesgo"
          body="Confianza mide que tan probable ve el protocolo el pick. Riesgo combina probabilidad, cuota, EV, mercado y volatilidad. Un pick puede ser probable y aun asi ser mala apuesta si la cuota paga poco."
          example="Ejemplo: Local goles +0.5 con 78% y cuota 1.15. Es probable, pero Betano lo paga como si tuviera 87%; por eso el EV es negativo y el riesgo queda alto."
        />
        <GuideCard
          title="EV o valor esperado"
          body="EV estima si una cuota paga por encima o por debajo de la probabilidad calculada. EV positivo significa que, segun el modelo, la cuota ofrece valor. EV negativo significa que la cuota esta cara."
          example="Formula aproximada: EV = probabilidad estimada * cuota - 1. Si 0.78 * 1.15 - 1 = -0.10, la apuesta tiene valor esperado negativo."
        />
        <GuideCard
          title="Probabilidad implicita"
          body="Es la probabilidad que la casa esta reflejando en la cuota. Sirve para comparar mercado contra modelo."
          example="Cuota 1.15 implica 1 / 1.15 = 86.96%. Si tu modelo estima 78%, no hay valor aunque el pick parezca seguro."
        />
        <GuideCard
          title="Edge"
          body="Edge es la diferencia entre tu probabilidad estimada y la probabilidad implicita de la cuota. Edge positivo indica ventaja teorica; edge negativo indica cuota desfavorable."
          example="Si el modelo estima 62% y la cuota implica 54%, edge = +8 puntos porcentuales."
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-semibold">Glosario de mercados y siglas</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <GlossaryItem term="DNB" text="Draw No Bet. Si el partido empata, la apuesta se devuelve. Si gana tu equipo, aciertas; si pierde, fallas." />
          <GlossaryItem term="BTTS" text="Both Teams To Score. Ambos equipos anotan. BTTS si = ambos marcan; BTTS no = al menos uno queda en cero." />
          <GlossaryItem term="1T" text="Primer tiempo. Ejemplo: 1T +0.5 significa que debe haber al menos un gol en el primer tiempo." />
          <GlossaryItem term="+1.5 / -2.5" text="Lineas over/under. +1.5 equivale a mas de 1.5; -2.5 equivale a menos de 2.5." />
          <GlossaryItem term="Local / Visita" text="Local es el primer equipo del partido en el reporte; visita es el segundo. El liquidador ajusta si la fuente oficial invierte el orden." />
          <GlossaryItem term="Stake" text="Monto sugerido de exposicion. Debe ser conservador y proporcional al bankroll, nunca una garantia." />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
          <h3 className="font-semibold text-emerald-950 dark:text-emerald-100">Senales para tomar un pick</h3>
          <ul className="mt-3 space-y-2 text-sm text-emerald-950 dark:text-emerald-100">
            <li>EV positivo en Betano.</li>
            <li>Edge positivo contra la cuota implicita.</li>
            <li>Probabilidad alta y cuota no castigada.</li>
            <li>Riesgo bajo o medio, salvo que sea una jugada especulativa muy controlada.</li>
            <li>Mercado poco correlacionado si va dentro de una combinada.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
          <h3 className="font-semibold text-amber-950 dark:text-amber-100">Senales para evitar o esperar</h3>
          <ul className="mt-3 space-y-2 text-sm text-amber-950 dark:text-amber-100">
            <li>EV negativo aunque la probabilidad sea alta.</li>
            <li>Cuota menor a la cuota justa calculada por el modelo.</li>
            <li>Demasiados picks correlacionados del mismo partido.</li>
            <li>Mercados con alta volatilidad: tarjetas, corners, tiros.</li>
            <li>Falta de alineaciones, contexto o confirmacion de cuota en Betano.</li>
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-950 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">
        Juego responsable: usa esta informacion como apoyo analitico. No apuestes dinero que no puedas perder y valida siempre cuota, mercado y condiciones antes de apostar.
      </section>
    </section>
  )
}

function GuideCard({ title, body, example }: { title: string; body: string; example: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{body}</p>
      <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{example}</p>
    </article>
  )
}

function GlossaryItem({ term, text }: { term: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <p className="font-bold text-teal-800 dark:text-teal-200">{term}</p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  )
}

function settlementClass(settlement: Settlement) {
  if (settlement === 'Acertado') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
  if (settlement === 'Fallado') return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
  if (settlement === 'Devuelto') return 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-200'
  if (settlement === 'Sin dato oficial') return 'border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-200'
  return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200'
}

const settlementColors: Record<Settlement, string> = {
  Acertado: '#059669',
  Fallado: '#e11d48',
  Devuelto: '#64748b',
  'Sin dato oficial': '#71717a',
  Pendiente: '#f59e0b',
}

function historyChartData(summary: ReturnType<typeof summarizeHistory>) {
  return [
    { name: 'Acertados', value: summary.won, fill: settlementColors.Acertado },
    { name: 'Fallados', value: summary.lost, fill: settlementColors.Fallado },
    { name: 'Devueltos', value: summary.returned, fill: settlementColors.Devuelto },
    { name: 'Sin dato oficial', value: summary.noData, fill: settlementColors['Sin dato oficial'] },
    { name: 'Pendientes', value: summary.pending, fill: settlementColors.Pendiente },
  ].filter((item) => item.value > 0)
}

function dateChartData(records: SuggestedHistoryRecord[]) {
  return historyByDate(records)
    .map(([date, items]) => {
      const summary = summarizeHistory(items)
      return {
        date,
        Acertados: summary.won,
        Fallados: summary.lost,
        Devueltos: summary.returned,
        'Sin dato oficial': summary.noData,
        Pendientes: summary.pending,
        Profit: Number(summary.profit.toFixed(2)),
      }
    })
    .reverse()
}

function SuggestedHistoryView({
  records,
  mode,
  onSettle,
  onRefreshActual,
  onRecalculateActual,
  refreshLoading = false,
  refreshError = '',
  requestSummary,
}: {
  records: SuggestedHistoryRecord[]
  mode: 'user' | 'actual'
  onSettle?: (key: string, settlement: Settlement) => void
  onRefreshActual?: () => void
  onRecalculateActual?: () => void
  refreshLoading?: boolean
  refreshError?: string
  requestSummary?: SettlementRequestSummary | null
}) {
  const summary = summarizeHistory(records)
  const grouped = historyByDate(records)
  const maxDateTotal = Math.max(1, ...grouped.map(([, items]) => items.length))
  const isUserMode = mode === 'user'
  const title = isUserMode ? 'Mi seguimiento de aciertos' : 'Historial real de recomendaciones'
  const emptyText = isUserMode
    ? 'No hay picks sugeridos con los filtros actuales. Revisa fecha, EV+, probabilidad minima o riesgo.'
    : 'No hay recomendaciones sugeridas con los filtros actuales para contrastar contra resultados reales.'
  const description = isUserMode
    ? 'Control personal de los picks sugeridos. Las marcas manuales se guardan en este navegador.'
    : 'Rendimiento real de los picks de las combinadas sugeridas, usando solo resultados cargados por CSV/HTML del protocolo.'

  if (!records.length) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-teal-700 dark:text-teal-300" />
          <h2 className="font-semibold">{title}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {emptyText}
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-teal-700 dark:text-teal-300" />
              <h2 className="font-semibold">{title}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {description}
            </p>
          </div>
          <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-100">
            {isUserMode ? 'Modo editable por usuario' : 'Solo resultados reales cargados'} · Stake simulado: 1 unidad
          </Badge>
        </div>
        {!isUserMode && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr] lg:items-center">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRefreshActual}
                disabled={refreshLoading}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Actualizar resultados reales
              </button>
              <button
                type="button"
                onClick={onRecalculateActual}
                disabled={refreshLoading}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
              >
                Recalcular historial
              </button>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {requestSummary ? (
                <span>
                  API requests: <strong>{requestSummary.apiRequests}</strong> · partidos: <strong>{requestSummary.uniqueMatches}</strong> · extra por partido: <strong>{requestSummary.estimatedExtraRequestsPerMatch}</strong> · cache hits: <strong>{requestSummary.cacheHits}</strong>
                </span>
              ) : (
                <span>Consulta server-side con API-Football. La clave no se envia al navegador.</span>
              )}
            </div>
          </div>
        )}
        {refreshError && (
          <p className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">
            {refreshError}
          </p>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <Kpi label="Sugeridos" value={summary.total.toString()} />
        <Kpi label="Liquidados" value={summary.settled.toString()} />
        <Kpi label="Acertados" value={summary.won.toString()} tone="green" />
        <Kpi label="Fallados" value={summary.lost.toString()} />
        <Kpi label="Devueltos" value={summary.returned.toString()} />
        <Kpi label="Sin dato oficial" value={summary.noData.toString()} />
        <Kpi label="Pendientes" value={summary.pending.toString()} />
        <Kpi label="Acierto" value={summary.hitRate === null ? 'N/D' : formatPct(summary.hitRate * 100)} tone="green" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-semibold">Distribucion de resultados</h3>
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={historyChartData(summary)} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {historyChartData(summary).map((item) => <Cell key={item.name} fill={item.fill} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {historyChartData(summary).map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: item.fill }} />
                <span>{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-semibold">Resultados por fecha</h3>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dateChartData(records)} margin={{ top: 8, right: 16, left: 0, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" angle={-30} textAnchor="end" height={58} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Acertados" stackId="results" fill={settlementColors.Acertado} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Fallados" stackId="results" fill={settlementColors.Fallado} />
                <Bar dataKey="Devueltos" stackId="results" fill={settlementColors.Devuelto} />
                <Bar dataKey="Sin dato oficial" stackId="results" fill={settlementColors['Sin dato oficial']} />
                <Bar dataKey="Pendientes" stackId="results" fill={settlementColors.Pendiente} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-semibold">Resumen por fecha</h3>
          <div className="mt-4 space-y-3">
            {grouped.map(([date, items]) => {
              const day = summarizeHistory(items)
              const wonWidth = `${(day.won / maxDateTotal) * 100}%`
              const lostWidth = `${(day.lost / maxDateTotal) * 100}%`
              const returnedWidth = `${(day.returned / maxDateTotal) * 100}%`
              const noDataWidth = `${(day.noData / maxDateTotal) * 100}%`
              const pendingWidth = `${(day.pending / maxDateTotal) * 100}%`
              return (
                <div key={date}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{date}</span>
                    <span className="text-slate-500">{day.won}A / {day.lost}F / {day.returned}D / {day.noData}S / {day.pending}P</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
                    <span className="bg-emerald-500" style={{ width: wonWidth }} />
                    <span className="bg-rose-500" style={{ width: lostWidth }} />
                    <span className="bg-slate-500" style={{ width: returnedWidth }} />
                    <span className="bg-zinc-400" style={{ width: noDataWidth }} />
                    <span className="bg-amber-400" style={{ width: pendingWidth }} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            P/L simulado: <strong>{summary.profit.toFixed(2)} u</strong>. ROI simulado: <strong>{summary.roi === null ? 'N/D' : formatPct(summary.roi * 100)}</strong>.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Partido</th>
                <th className="px-4 py-3">Pick sugerido</th>
                <th className="px-4 py-3">Cuota</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Riesgo</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {records.map((record) => (
                <tr key={record.key}>
                  <td className="px-4 py-3">{record.fecha} {record.hora}</td>
                  <td className="px-4 py-3 font-semibold">{record.partido}</td>
                  <td className="px-4 py-3">{record.pick.pick}</td>
                  <td className="px-4 py-3">{formatDecimal(record.pick.odds)}</td>
                  <td className="px-4 py-3 font-bold">{record.pick.pickScore.toFixed(1)}</td>
                  <td className="px-4 py-3"><Badge className={riskClass(record.pick.riskTier)}>{record.pick.riskTier}</Badge></td>
                  <td className="px-4 py-3">
                    {isUserMode && onSettle ? (
                      <select
                        value={record.settlement}
                        onChange={(event) => onSettle(record.key, event.target.value as Settlement)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Acertado">Acertado</option>
                        <option value="Fallado">Fallado</option>
                      <option value="Devuelto">Devuelto</option>
                      </select>
                    ) : (
                      <Badge className={settlementClass(record.settlement)}>{record.settlement}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3"><Badge className={settlementClass(record.settlement)}>{record.settlementSource}</Badge></td>
                  <td className="px-4 py-3">
                    <div>{record.profit === null ? 'N/D' : `${record.profit.toFixed(2)} u`}</div>
                    {record.reason && <div className="mt-1 max-w-[260px] text-xs text-slate-500">{record.reason}</div>}
                    {record.fixture?.score && <div className="mt-1 text-xs text-slate-500">Marcador: {record.fixture.score}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function PicksTable({ picks, sortKey, setSortKey }: { picks: ProcessedPick[]; sortKey: SortKey; setSortKey: (key: SortKey) => void }) {
  const headers: { key: SortKey; label: string }[] = [
    { key: 'score', label: 'Score' },
    { key: 'edge', label: 'Edge' },
    { key: 'probability', label: 'Probabilidad' },
    { key: 'ev', label: 'EV' },
    { key: 'odds', label: 'Cuota' },
    { key: 'risk', label: 'Riesgo' },
  ]

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
        {headers.map((header) => (
          <button key={header.key} type="button" onClick={() => setSortKey(header.key)} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${sortKey === header.key ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
            <ArrowUpDown className="h-4 w-4" />
            {header.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1420px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3">Partido</th>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">Pick</th>
              <th className="px-4 py-3">Prob.</th>
              <th className="px-4 py-3">Book ref.</th>
              <th className="px-4 py-3">Cuota ref.</th>
              <th className="px-4 py-3">EV ref.</th>
              <th className="px-4 py-3">Cuota Betano</th>
              <th className="px-4 py-3">EV Betano</th>
              <th className="px-4 py-3">Cuota 10Bet/API</th>
              <th className="px-4 py-3">EV 10Bet/API</th>
              <th className="px-4 py-3">Edge</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Riesgo</th>
              <th className="px-4 py-3">Confianza</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {picks.map((pick) => (
              <tr key={pick.id}>
                <td className="px-4 py-3 font-semibold">{pick.partido}</td>
                <td className="px-4 py-3">{pick.hora}</td>
                <td className="px-4 py-3">{pick.pick}</td>
                <td className="px-4 py-3">{formatPct(pick.probabilityPct)}</td>
                <td className="px-4 py-3"><Badge className="border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200">{pick.preferredBookmaker}</Badge></td>
                <td className="px-4 py-3">{formatDecimal(pick.odds)}</td>
                <td className="px-4 py-3"><EvBadge value={pick.ev} positive={pick.isPositiveEV} /></td>
                <td className="px-4 py-3">{formatDecimal(pick.oddsBetano)}</td>
                <td className="px-4 py-3"><EvBadge value={pick.evBetano} positive={pick.isPositiveBetanoEV} /></td>
                <td className="px-4 py-3">{formatDecimal(pick.oddsApi)}</td>
                <td className="px-4 py-3"><EvBadge value={pick.evApi} positive={pick.isPositiveApiEV} /></td>
                <td className="px-4 py-3">{pick.edgePct?.toFixed(1) ?? 'N/D'}%</td>
                <td className="px-4 py-3 font-bold">{pick.pickScore.toFixed(1)}</td>
                <td className="px-4 py-3"><Badge className={riskClass(pick.riskTier)}>{pick.riskTier}</Badge></td>
                <td className="px-4 py-3">{pick.confianza}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BetanoSimulation({
  picks,
  dates,
  selections,
  onToggle,
  onUseRecommended,
  onClear,
}: {
  picks: ProcessedPick[]
  dates: string[]
  selections: Record<string, boolean>
  onToggle: (key: string) => void
  onUseRecommended: (keys: string[]) => void
  onClear: () => void
}) {
  const groups = Object.entries(
    picks.reduce<Record<string, ProcessedPick[]>>((acc, pick) => {
      const key = `${pick.fecha}|${pick.partido}`
      acc[key] = [...(acc[key] ?? []), pick]
      return acc
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b))
  const selectedPicks = picks.filter((pick) => selections[suggestedPickKey(pick)])
  const selectedByMatch = selectedPicks.reduce<Record<string, ProcessedPick[]>>((acc, pick) => {
    const key = `${pick.fecha}|${pick.partido}`
    acc[key] = [...(acc[key] ?? []), pick]
    return acc
  }, {})
  const totalOdds = combinedOdds(selectedPicks)

  if (!picks.length) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-teal-700 dark:text-teal-300" />
          <h2 className="font-semibold">Simulacion Betano</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          No hay cuotas Betano disponibles para el rango activo: hoy y los dos dias siguientes.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-teal-700 dark:text-teal-300" />
              <h2 className="font-semibold">Simulacion Betano</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Partidos vigentes del dia y los 2 proximos dias con cuota Betano. Las filas destacadas son las recomendaciones del protocolo, priorizadas por mayor probabilidad.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Riesgo combina probabilidad, EV y perfil de cuota; una probabilidad alta puede seguir marcada como riesgo alto si el valor esperado o la cuota no acompanan.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
              {dates.map((date) => <Badge key={date} className="border-teal-500/40 bg-teal-500/10 text-teal-800 dark:text-teal-100">{date}</Badge>)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Limpiar seleccion
          </button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Partidos Betano" value={groups.length.toString()} />
        <Kpi label="Picks seleccionados" value={selectedPicks.length.toString()} tone="green" />
        <Kpi label="Partidos combinados" value={Object.keys(selectedByMatch).length.toString()} />
        <Kpi label="Cuota total" value={totalOdds === null ? 'N/D' : totalOdds.toFixed(2)} tone="green" />
      </section>

      {selectedPicks.length > 0 && (
        <section className="rounded-lg border border-teal-300 bg-teal-50 p-4 shadow-sm dark:border-teal-800 dark:bg-teal-950/30">
          <h3 className="font-semibold text-teal-950 dark:text-teal-100">Ticket combinado entre partidos</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              {Object.entries(selectedByMatch).map(([key, matchPicks]) => (
                <div key={key} className="rounded-md border border-teal-200 bg-white p-3 text-sm dark:border-teal-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{key.replace('|', ' - ')}</strong>
                    <span>Cuota partido: <strong>{formatDecimal(combinedOdds(matchPicks))}</strong></span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {matchPicks.map((pick) => `${pick.pick} @ ${formatDecimal(pick.oddsBetano)}`).join(' + ')}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-teal-300 bg-white p-4 dark:border-teal-700 dark:bg-slate-950">
              <p className="text-sm text-slate-500">Cuota combinada total</p>
              <p className="mt-2 text-3xl font-bold text-teal-800 dark:text-teal-200">{totalOdds === null ? 'N/D' : totalOdds.toFixed(2)}</p>
              <p className="mt-2 text-xs text-slate-500">Validar cuota en Betano antes de apostar. No es garantia de ganancia.</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        {groups.map(([groupKey, matchPicks]) => {
          const recommended = createBetanoSuggestedParlay(matchPicks, 4)
          const recommendedKeys = new Set(recommended.map(suggestedPickKey))
          const selectedInMatch = matchPicks.filter((pick) => selections[suggestedPickKey(pick)])
          const matchOdds = combinedOdds(selectedInMatch)
          const [date, match] = groupKey.split('|')
          const sorted = [...matchPicks].sort((a, b) => b.probability - a.probability || (b.evBetano ?? -999) - (a.evBetano ?? -999))

          return (
            <article key={groupKey} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">{date}</p>
                  <h3 className="text-lg font-bold">{match}</h3>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Cuota partido</p>
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{matchOdds === null ? 'N/D' : matchOdds.toFixed(2)}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUseRecommended([...recommendedKeys])}
                  disabled={!recommendedKeys.size}
                  className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Usar recomendadas
                </button>
                <Badge className="border-teal-500/40 bg-teal-500/10 text-teal-800 dark:text-teal-100">
                  {recommended.length} recomendadas
                </Badge>
              </div>

              <div className="mt-4 space-y-2">
                {sorted.map((pick) => {
                  const key = suggestedPickKey(pick)
                  const recommendedPick = recommendedKeys.has(key)
                  const selected = Boolean(selections[key])
                  return (
                    <label
                      key={key}
                      className={`grid cursor-pointer gap-3 rounded-md border p-3 text-sm transition sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                        selected
                          ? 'border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40'
                          : recommendedPick
                            ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950'
                      }`}
                    >
                      <input type="checkbox" checked={selected} onChange={() => onToggle(key)} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{pick.pick}</strong>
                          {recommendedPick && <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100">Recomendada</Badge>}
                          <Badge className={riskClass(pick.riskTier)}>Riesgo: {pick.riskTier}</Badge>
                          <Badge className="border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">Confianza: {pick.confianza}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Prob. {formatPct(pick.probabilityPct)} - EV Betano {formatDecimal(pick.evBetano)} - {marketLabels[pick.marketType]}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Betano</p>
                        <p className="text-lg font-bold">{formatDecimal(pick.oddsBetano)}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </article>
          )
        })}
      </section>
    </section>
  )
}

function MatchCards({ picks }: { picks: ProcessedPick[] }) {
  const grouped = groupByMatch(picks)
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {Object.entries(grouped).map(([match, matchPicks]) => {
        const safe = [...matchPicks].filter((pick) => pick.riskTier === 'Bajo').sort((a, b) => b.probability - a.probability)[0]
        const bestEv = [...matchPicks].sort((a, b) => (b.ev ?? -999) - (a.ev ?? -999))[0]
        const balanced = [...matchPicks].sort((a, b) => b.pickScore - a.pickScore)[0]
        const topEv = [...matchPicks].filter((pick) => pick.isPositiveEV).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0)).slice(0, 5)
        const parlay = createSuggestedParlay(matchPicks, 4)
        return (
          <article key={match} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{match}</h2>
                <p className="text-sm text-slate-500">{matchPicks[0]?.fecha} {matchPicks[0]?.hora}</p>
              </div>
              <Badge className="border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-200">{matchPicks.length} mercados</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <PickMini title="Mejor seguro" pick={safe} />
              <PickMini title="Mejor EV" pick={bestEv} />
              <PickMini title="Balanceado" pick={balanced} />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold">Top 5 mercados EV+</p>
              <div className="space-y-2">
                {topEv.map((pick) => <PickLine key={pick.id} pick={pick} />)}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="mb-2 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-teal-700 dark:text-teal-300" />
                <p className="font-semibold">Combinada sugerida</p>
              </div>
              {parlay.length ? (
                <div className="space-y-2">
                  {parlay.map((pick) => <PickLine key={pick.id} pick={pick} />)}
                  {parlay.length > 10 && <p className="text-sm text-rose-600">Advertencia: combinada con mas de 10 selecciones.</p>}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No hay suficientes picks Bajo/Medio con EV+ para combinada.</p>
              )}
            </div>
          </article>
        )
      })}
    </section>
  )
}

function PickMini({ title, pick }: { title: string; pick?: ProcessedPick }) {
  return (
    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase text-slate-500">{title}</p>
      {pick ? (
        <>
          <p className="mt-1 font-semibold">{pick.pick}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">Prob. {formatPct(pick.probabilityPct)} · EV {pick.ev?.toFixed(2) ?? 'N/D'} · Score {pick.pickScore.toFixed(1)}</p>
        </>
      ) : <p className="mt-1 text-sm text-slate-500">No disponible</p>}
    </div>
  )
}

function PickLine({ pick }: { pick: ProcessedPick }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-950">
      <span className="font-semibold">{pick.pick}</span>
      <span className="text-slate-600 dark:text-slate-300">Cuota {pick.odds?.toFixed(2)} · Prob. {formatPct(pick.probabilityPct)} · Score {pick.pickScore.toFixed(1)}</span>
    </div>
  )
}

function NoOddsTable({ picks }: { picks: ProcessedPick[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
        <AlertTriangle className="h-5 w-5 text-slate-500" />
        <div>
          <h2 className="font-semibold">Probabilidades sin cuota</h2>
          <p className="text-sm text-slate-500">Mercados informativos. No entran al panel principal ni a combinadas.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950">
            <tr><th className="px-4 py-3">Partido</th><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Pick</th><th className="px-4 py-3">Probabilidad</th><th className="px-4 py-3">Confianza</th><th className="px-4 py-3">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-600 dark:divide-slate-800 dark:text-slate-300">
            {picks.map((pick) => (
              <tr key={pick.id} className="bg-slate-50/50 dark:bg-slate-950/30">
                <td className="px-4 py-3 font-semibold">{pick.partido}</td>
                <td className="px-4 py-3">{pick.hora}</td>
                <td className="px-4 py-3">{pick.pick}</td>
                <td className="px-4 py-3">{formatPct(pick.probabilityPct)}</td>
                <td className="px-4 py-3">{pick.confianza}</td>
                <td className="px-4 py-3">Informativo</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

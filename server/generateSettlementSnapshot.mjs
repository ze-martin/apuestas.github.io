import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { settlePicks } from './settlementServer.mjs'

const projectRoot = process.cwd()
const sourceIndexUrl = process.env.VITE_PROTOCOL_INDEX_URL || 'https://ze-martin.github.io/'
const outputPath = process.env.SETTLEMENT_SNAPSHOT_PATH || path.join(projectRoot, 'public', 'settlements', 'latest.json')

function absoluteUrl(href, baseUrl) {
  return new URL(href, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function htmlDecode(value) {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripTags(value) {
  return htmlDecode(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function extractReportUrls(indexHtml, baseUrl) {
  return unique(
    Array.from(indexHtml.matchAll(/href=["']([^"']*reports\/[^"']+\.html)["']/gi))
      .map((match) => absoluteUrl(match[1], baseUrl)),
  ).sort((a, b) => inferDateFromSource(b).localeCompare(inferDateFromSource(a)))
}

function inferDateFromSource(sourceLabel) {
  const match = sourceLabel.match(/(20\d{6})/)
  if (!match) return ''
  const raw = match[1]
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function reportDateFrom(sourceUrl, html) {
  const titleDate = html.match(/<h1[^>]*>[\s\S]*?(\d{4}-\d{2}-\d{2})[\s\S]*?<\/h1>/i)?.[1]
  if (titleDate) return titleDate
  const compact = sourceUrl.match(/(20\d{6})/)?.[1]
  if (compact) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
  return 'No disponible'
}

function extractCells(rowHtml) {
  return Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => stripTags(match[1]))
}

function attr(rowHtml, name) {
  return rowHtml.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'))?.[1] ?? ''
}

function parseHtmlReport(html, sourceUrl) {
  const date = reportDateFrom(sourceUrl, html)
  const marketsTable = html.match(/<table[^>]*id=["']markets["'][\s\S]*?<\/table>/i)?.[0] ?? html
  const headers = Array.from(marketsTable.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)).map((match) => stripTags(match[1]).toLowerCase())
  const hasDualOddsSchema = headers.some((header) => header.includes('betano'))

  return Array.from(marketsTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => ({ rowHtml: match[0], cells: extractCells(match[1]) }))
    .filter(({ cells }) => cells.length >= 6)
    .map(({ rowHtml, cells }, index) => {
      const row = hasDualOddsSchema
        ? {
            fecha: date,
            hora: cells[1] ?? '',
            partido: cells[2] ?? '',
            pick: cells[3] ?? '',
            market_original: cells[3] ?? '',
            prob_num: cells[4] ?? '',
            bookmaker_api: cells[5] || '10Bet/API',
            cuota_api: cells[6] ?? '',
            ev_api: attr(rowHtml, 'data-ev-api') || cells[7] || '',
            bookmaker_betano: cells[8] || 'Betano',
            cuota_betano: cells[9] ?? '',
            ev_betano: attr(rowHtml, 'data-ev-betano') || cells[10] || '',
            estado_api: cells[11] ?? '',
            estado_betano: cells[12] ?? '',
            estado: cells[12] || cells[11] || '',
            confianza: cells[13] ?? '',
            fuente: cells[14] ?? '',
            razon: cells[14] ?? '',
            riesgo: cells[15] ?? '',
          }
        : {
            fecha: date,
            hora: cells[1] ?? '',
            partido: cells[2] ?? '',
            bookmaker: 'API-Football/10Bet',
            pick: cells[3] ?? '',
            market_original: cells[3] ?? '',
            prob_num: cells[4] ?? '',
            cuota: cells[5] ?? '',
            ev_num: cells[6] ?? '',
            estado: cells[7] ?? '',
            confianza: cells[8] ?? '',
            fuente: cells[9] ?? '',
            razon: cells[9] ?? '',
            riesgo: cells[10] ?? '',
          }
      return processRawPick(row, index)
    })
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace('%', '').replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseProbability(value) {
  const parsed = parseNumber(value)
  if (parsed === null) return 0
  return parsed > 1 ? parsed / 100 : Math.max(0, parsed)
}

function normalizeMarket(input) {
  const value = input.toLowerCase()
  const line = parseNumber(value.match(/[+-]\s*(\d+(?:[.,]\d+)?)/)?.[1] ?? value.match(/(?:over|under)[.\s]*(\d+(?:[.,]\d+)?)/)?.[1] ?? value.match(/(\d+(?:[.,]\d+)?)/)?.[1] ?? null)
  let marketType = 'other'
  if (value.includes('1t') || value.includes('primer tiempo') || value.includes('first half')) marketType = 'first_half_goals'
  else if (value.includes('corner')) marketType = 'corners'
  else if (value.includes('tarjeta') || value.includes('card')) marketType = 'cards'
  else if (value.includes('btts') || value.includes('ambos')) marketType = 'btts'
  else if (value.includes('dnb') || value.includes('draw no bet')) marketType = 'draw_no_bet'
  else if (value.includes('shot') || value.includes('tiro')) marketType = 'shots'
  else if (value.includes('1x2') || value.includes('gana local') || value.includes('gana visita')) marketType = 'winner'
  else if (value.includes('gol') || value.includes('goal') || value.includes('team_total')) marketType = 'goals'

  let side = 'none'
  if (value.includes('local') || value.includes('home') || value.includes('team_total_home')) side = 'home'
  else if (value.includes('visita') || value.includes('away') || value.includes('team_total_away')) side = 'away'
  else if (marketType !== 'winner' && marketType !== 'draw_no_bet') side = 'total'

  let direction = 'none'
  if (value.includes('+') || value.includes('over')) direction = 'over'
  else if (value.includes('-') || value.includes('under')) direction = 'under'
  else if (value.includes('si') || value.includes('yes')) direction = 'yes'
  else if (value.includes(' no') || value.endsWith('no')) direction = 'no'
  else if (value.includes('local') || value.includes('home')) direction = 'home'
  else if (value.includes('visita') || value.includes('away')) direction = 'away'

  return { marketType, side, direction, line, correlationGroup: `${marketType}:${side}:${direction}` }
}

function confidenceWeight(value) {
  const normalized = String(value).toLowerCase()
  if (normalized.includes('alta')) return 1
  if (normalized.includes('media')) return 0.65
  if (normalized.includes('baja')) return 0.35
  return 0
}

function classifyRisk(probability, ev, odds) {
  if ((odds ?? 0) >= 3 || probability < 0.65) return 'Alto'
  if (probability >= 0.8 && (ev ?? 0) > 0) return 'Bajo'
  if (probability >= 0.65 && probability < 0.8 && (ev ?? 0) > 0) return 'Medio'
  return 'Alto'
}

function processRawPick(row, index) {
  const probability = parseProbability(row.prob_num ?? row.probabilidad)
  const oddsApi = parseNumber(row.cuota_api ?? row.cuota)
  const oddsBetano = parseNumber(row.cuota_betano)
  const evApi = parseNumber(row.ev_api ?? row.ev_num ?? row.ev)
  const evBetano = parseNumber(row.ev_betano)
  const hasApiOdds = oddsApi !== null && oddsApi > 1
  const hasBetanoOdds = oddsBetano !== null && oddsBetano > 1
  const hasOdds = hasBetanoOdds || hasApiOdds
  const odds = hasBetanoOdds ? oddsBetano : hasApiOdds ? oddsApi : null
  const ev = hasBetanoOdds ? evBetano : evApi
  const bookmakerApi = row.bookmaker_api || row.bookmaker || '10Bet/API'
  const bookmakerBetano = row.bookmaker_betano || 'Betano'
  const preferredBookmaker = hasBetanoOdds ? bookmakerBetano : hasApiOdds ? bookmakerApi : 'No disponible'
  const impliedProbability = odds ? 1 / odds : null
  const edge = impliedProbability === null ? null : probability - impliedProbability
  const pick = String(row.pick || row.market_original || '').trim()
  const market = normalizeMarket(`${row.market_original ?? ''} ${pick}`)
  const weight = confidenceWeight(row.confianza)

  return {
    id: `${row.fecha}-${row.partido}-${index}`,
    fecha: row.fecha || 'No disponible',
    hora: row.hora || '',
    partido: row.partido || 'No disponible',
    pick,
    bookmakerApi,
    bookmakerBetano,
    preferredBookmaker,
    probability,
    odds,
    oddsApi: hasApiOdds ? oddsApi : null,
    oddsBetano: hasBetanoOdds ? oddsBetano : null,
    ev,
    hasOdds,
    isPositiveEV: (ev ?? 0) > 0,
    pickScore: Math.max(0, Math.min(100, probability * 45 + Math.max(edge ?? 0, 0) * 35 + weight * 20)),
    riskTier: classifyRisk(probability, ev, odds),
    ...market,
  }
}

function isRedundantLine(a, b) {
  return a.marketType === b.marketType && a.side === b.side && a.direction === b.direction && a.line !== null && b.line !== null
}

function createSuggestedParlay(picks, maxLegs = 4) {
  const selected = []
  const candidates = picks
    .filter((pick) => pick.hasOdds && pick.isPositiveEV && pick.riskTier !== 'Alto' && pick.probability >= 0.7)
    .sort((a, b) => {
      const riskA = a.riskTier === 'Bajo' ? 0 : 1
      const riskB = b.riskTier === 'Bajo' ? 0 : 1
      return b.probability - a.probability || riskA - riskB || b.pickScore - a.pickScore
    })

  for (const candidate of candidates) {
    if (selected.length >= maxLegs) break
    if (selected.filter((pick) => pick.correlationGroup === candidate.correlationGroup).length >= 2) continue
    if (selected.some((pick) => isRedundantLine(pick, candidate))) continue
    selected.push(candidate)
  }
  return selected
}

function suggestedPickKey(pick) {
  return `${pick.fecha}|${pick.hora}|${pick.partido}|${pick.pick}|${pick.preferredBookmaker}`
}

async function fetchText(url) {
  const fetchUrl = new URL(url)
  fetchUrl.searchParams.set('_refresh', Date.now().toString())
  const response = await fetch(fetchUrl.toString(), { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status} leyendo ${url}`)
  return response.text()
}

async function main() {
  if (!process.env.FOOTBALL_API_KEY) {
    throw new Error('FOOTBALL_API_KEY no esta configurada. Agregala como secret del repositorio antes de generar resultados.')
  }

  const indexHtml = await fetchText(sourceIndexUrl)
  const reportUrls = extractReportUrls(indexHtml, sourceIndexUrl)
  if (!reportUrls.length) throw new Error(`No encontre reportes en ${sourceIndexUrl}`)

  const reports = await Promise.all(reportUrls.map(async (url) => parseHtmlReport(await fetchText(url), url)))
  const picks = reports.flat().filter((pick) => pick.hasOdds && pick.isPositiveEV && pick.probability >= 0.7)
  const grouped = picks.reduce((acc, pick) => {
    const key = `${pick.fecha}|${pick.partido}`
    acc[key] = [...(acc[key] ?? []), pick]
    return acc
  }, {})

  const suggested = Object.values(grouped).flatMap((matchPicks) => createSuggestedParlay(matchPicks, 4))
  const payload = suggested.map((pick) => ({
    key: suggestedPickKey(pick),
    fecha: pick.fecha,
    hora: pick.hora,
    partido: pick.partido,
    pick: pick.pick,
    marketType: pick.marketType,
    side: pick.side,
    direction: pick.direction,
    line: pick.line,
  }))

  const result = await settlePicks(payload, true)
  const snapshot = {
    generatedAt: new Date().toISOString(),
    sourceIndexUrl,
    reportCount: reportUrls.length,
    suggestedPickCount: payload.length,
    ...result,
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Snapshot generado: ${outputPath}`)
  console.log(`Picks sugeridos liquidados: ${payload.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

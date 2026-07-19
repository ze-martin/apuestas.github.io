import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const projectRoot = process.cwd()
loadEnv(path.join(projectRoot, '.env'))
loadEnv(path.resolve(projectRoot, '..', 'APUESTAS', '.env'), false)

const port = Number(process.env.SETTLEMENT_API_PORT || 8787)
const apiBaseUrl = process.env.FOOTBALL_API_BASE_URL || 'https://v3.football.api-sports.io'
const apiKey = process.env.FOOTBALL_API_KEY || ''
const season = process.env.FOOTBALL_SEASON || '2026'
const leagues = csv(process.env.API_FOOTBALL_LEAGUES || '2,3,39,140,135,78,281,11,13')
const cacheDir = path.join(projectRoot, 'data', 'settlement-cache')
const pendingTtlMs = Number(process.env.SETTLEMENT_PENDING_TTL_MINUTES || 60) * 60 * 1000
const settledTtlMs = Number(process.env.SETTLEMENT_SETTLED_TTL_DAYS || 30) * 24 * 60 * 60 * 1000

function startSettlementServer() {
  createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return sendJson(res, 204, {})
      if (req.method === 'GET' && req.url === '/api/settlements/health') {
        return sendJson(res, 200, {
          ok: true,
          provider: 'api-football',
          hasApiKey: Boolean(apiKey),
          leagues,
        })
      }
      if (req.method !== 'POST' || !req.url?.startsWith('/api/settlements')) {
        return sendJson(res, 404, { error: 'Not found' })
      }
      if (!apiKey) {
        return sendJson(res, 500, { error: 'FOOTBALL_API_KEY no esta configurada en el servidor.' })
      }

      const payload = await readJson(req)
      const picks = Array.isArray(payload.picks) ? payload.picks : []
      const forceRefresh = Boolean(payload.forceRefresh)
      const result = await settlePicks(picks, forceRefresh)
      return sendJson(res, 200, result)
    } catch (error) {
      return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Error inesperado liquidando picks.' })
    }
  }).listen(port, '127.0.0.1', () => {
    console.log(`Settlement API escuchando en http://127.0.0.1:${port}`)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSettlementServer()
}

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

function csv(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
  })
  if (statusCode === 204) return res.end()
  res.end(JSON.stringify(data))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export async function settlePicks(picks, forceRefresh) {
  const requestSummary = {
    fixtureLookups: 0,
    fixtureStatistics: 0,
    fixtureEvents: 0,
    cacheHits: 0,
    cacheMisses: 0,
    matches: new Set(),
    liveMatches: new Set(),
  }
  const fixturesByDate = new Map()
  const statisticsByFixture = new Map()
  const eventsByFixture = new Map()
  const settlements = []

  for (const pick of picks) {
    const matchKey = `${pick.fecha}|${pick.partido}`
    requestSummary.matches.add(matchKey)
    const fixtureMatch = await findFixtureForPick(pick, fixturesByDate, requestSummary, forceRefresh)
    if (!fixtureMatch) {
      const reason = 'No se encontro fixture en API-Football para ese partido/fecha.'
      settlements.push(isBeforeToday(pick.fecha) ? noOfficialData(pick, reason) : pending(pick, reason))
      continue
    }

    const { fixture, reversed } = fixtureMatch
    if (fixtureIsLive(fixture)) requestSummary.liveMatches.add(matchKey)
    const settlementPick = reversed ? remapPickForReversedFixture(pick) : pick
    const needsStats = needsFixtureStatistics(pick)
    const stats = needsStats
      ? await getFixtureStatistics(fixture.fixture.id, statisticsByFixture, requestSummary, forceRefresh, fixtureIsFinished(fixture))
      : null
    const events = settlementPick.marketType === 'cards' && (fixtureIsFinished(fixture) || fixtureIsLive(fixture))
      ? await getFixtureEvents(fixture.fixture.id, eventsByFixture, requestSummary, forceRefresh)
      : null
    settlements.push(settlePick(settlementPick, fixture, stats, events, reversed))
  }

  const uniqueMatches = requestSummary.matches.size
  const apiMisses = requestSummary.fixtureLookups + requestSummary.fixtureStatistics + requestSummary.fixtureEvents
  return {
    settlements,
    requestSummary: {
      uniqueMatches,
      fixtureLookups: requestSummary.fixtureLookups,
      fixtureStatistics: requestSummary.fixtureStatistics,
      fixtureEvents: requestSummary.fixtureEvents,
      cacheHits: requestSummary.cacheHits,
      cacheMisses: requestSummary.cacheMisses,
      liveMatches: requestSummary.liveMatches.size,
      apiRequests: apiMisses,
      estimatedExtraRequestsPerMatch: uniqueMatches ? Number((apiMisses / uniqueMatches).toFixed(2)) : 0,
      maxRecommendedRequestsPerMatch: 3,
    },
  }
}

async function getFixturesForDate(date, memo, requestSummary, forceRefresh) {
  if (memo.has(date)) return memo.get(date)
  const allFixtures = []
  const response = await apiGet('fixtures', { date }, requestSummary, forceRefresh, false)
  requestSummary.fixtureLookups += response.wasNetworkRequest ? 1 : 0
  allFixtures.push(...(response.payload.response || []))

  if (!allFixtures.length && process.env.SETTLEMENT_FALLBACK_LEAGUE_LOOKUP === 'true') {
    for (const league of leagues) {
      const leagueResponse = await apiGet('fixtures', { date, league, season }, requestSummary, forceRefresh, false)
      requestSummary.fixtureLookups += leagueResponse.wasNetworkRequest ? 1 : 0
      allFixtures.push(...(leagueResponse.payload.response || []))
    }
  }
  memo.set(date, allFixtures)
  return allFixtures
}

async function findFixtureForPick(pick, fixturesByDate, requestSummary, forceRefresh) {
  const candidateDates = fixtureCandidateDates(pick.fecha)
  for (const date of candidateDates) {
    const fixtures = await getFixturesForDate(date, fixturesByDate, requestSummary, forceRefresh)
    const fixture = findFixture(fixtures, pick.partido)
    if (fixture) return fixture
  }
  return null
}

function fixtureCandidateDates(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return [date]
  const days = [0]
  if (isBeforeToday(date)) days.push(1, -1, 2, -2)
  return days.map((offset) => addDays(date, offset))
}

function addDays(date, offset) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}

async function getFixtureStatistics(fixtureId, memo, requestSummary, forceRefresh, settled) {
  if (memo.has(fixtureId)) return memo.get(fixtureId)
  const response = await apiGet('fixtures/statistics', { fixture: fixtureId }, requestSummary, forceRefresh, settled)
  requestSummary.fixtureStatistics += response.wasNetworkRequest ? 1 : 0
  const stats = response.payload.response || []
  memo.set(fixtureId, stats)
  return stats
}

async function getFixtureEvents(fixtureId, memo, requestSummary, forceRefresh) {
  if (memo.has(fixtureId)) return memo.get(fixtureId)
  const response = await apiGet('fixtures/events', { fixture: fixtureId }, requestSummary, forceRefresh, true)
  requestSummary.fixtureEvents += response.wasNetworkRequest ? 1 : 0
  const events = response.payload.response || []
  memo.set(fixtureId, events)
  return events
}

async function apiGet(endpoint, params, requestSummary, forceRefresh, settled) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')).toString()
  const cachePath = path.join(cacheDir, endpoint.replaceAll('/', '_'), `${hash(`${endpoint}?${query}`)}.json`)
  if (!forceRefresh) {
    const cached = await readCache(cachePath, settled ? settledTtlMs : pendingTtlMs)
    if (cached) {
      requestSummary.cacheHits += 1
      return { payload: cached, wasNetworkRequest: false }
    }
  }

  requestSummary.cacheMisses += 1
  const url = `${apiBaseUrl.replace(/\/$/, '')}/${endpoint}?${query}`
  const response = await fetch(url, { headers: { 'x-apisports-key': apiKey } })
  if (!response.ok) throw new Error(`API-Football ${endpoint} respondio HTTP ${response.status}`)
  const payload = await response.json()
  await writeCache(cachePath, payload)
  return { payload, wasNetworkRequest: true }
}

async function readCache(filePath, ttlMs) {
  try {
    const envelope = JSON.parse(await readFile(filePath, 'utf8'))
    if (Date.now() - Number(envelope.fetchedAt || 0) > ttlMs) return null
    return envelope.payload
  } catch {
    return null
  }
}

async function writeCache(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify({ fetchedAt: Date.now(), payload }, null, 2), 'utf8')
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalize(value) {
  const normalized = normalizeBase(value)
  return teamAliases[normalized] || normalized
}

function normalizeBase(value) {
  return String(value || '')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const teamAliases = {
  usa: 'united states',
  us: 'united states',
  'u s a': 'united states',
  turkiye: 'turkey',
  turkey: 'turkey',
  'south korea': 'south korea',
  'korea republic': 'south korea',
  czechia: 'czech republic',
  'czech republic': 'czech republic',
  'cape verde islands': 'cape verde',
  'cape verde': 'cape verde',
  'cabo verde': 'cape verde',
  'ivory coast': 'cote d ivoire',
  'cote d ivoire': 'cote d ivoire',
  curacao: 'curacao',
  'congo dr': 'dr congo',
  'dr congo': 'dr congo',
  'democratic republic of congo': 'dr congo',
  'bosnia and herzegovina': 'bosnia and herzegovina',
  'bosnia herzegovina': 'bosnia and herzegovina',
  'saudi arabia': 'saudi arabia',
}

function findFixture(fixtures, partido) {
  const [homeName, awayName] = String(partido).split(/\s+vs\s+/i).map((value) => value.trim())
  if (!homeName || !awayName) return null
  const direct = fixtures.find((item) => {
    const home = normalize(item.teams?.home?.name)
    const away = normalize(item.teams?.away?.name)
    return sameTeam(home, homeName) && sameTeam(away, awayName)
  })
  if (direct) return { fixture: direct, reversed: false }

  const reversed = fixtures.find((item) => {
    const home = normalize(item.teams?.home?.name)
    const away = normalize(item.teams?.away?.name)
    return sameTeam(home, awayName) && sameTeam(away, homeName)
  })
  return reversed ? { fixture: reversed, reversed: true } : null
}

function remapPickForReversedFixture(pick) {
  return {
    ...pick,
    side: swapHomeAway(pick.side),
    direction: swapHomeAway(pick.direction),
  }
}

function swapHomeAway(value) {
  if (value === 'home') return 'away'
  if (value === 'away') return 'home'
  return value
}

function sameTeam(apiName, reportName) {
  const api = normalize(apiName)
  const report = normalize(reportName)
  const rawApi = normalizeBase(apiName)
  const rawReport = normalizeBase(reportName)
  return (
    api === report ||
    rawApi === rawReport ||
    api.includes(report) ||
    report.includes(api) ||
    rawApi.includes(rawReport) ||
    rawReport.includes(rawApi)
  )
}

function fixtureIsFinished(fixture) {
  return ['FT', 'AET', 'PEN'].includes(fixture.fixture?.status?.short)
}

function fixtureIsLive(fixture) {
  return ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(fixture.fixture?.status?.short)
}

function todayYmd() {
  if (process.env.SETTLEMENT_TODAY) return process.env.SETTLEMENT_TODAY
  const timeZone = process.env.SETTLEMENT_TIMEZONE || 'America/Lima'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function isBeforeToday(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date)) && String(date) < todayYmd()
}

function needsFixtureStatistics(pick) {
  return ['corners', 'cards', 'shots'].includes(pick.marketType)
}

function statValue(stats, side, names) {
  const teamName = normalize(side)
  const row = stats.find((item) => normalize(item.team?.name).includes(teamName) || teamName.includes(normalize(item.team?.name)))
  if (!row) return null
  for (const stat of row.statistics || []) {
    if (names.includes(normalize(stat.type))) return numberValue(stat.value)
  }
  return null
}

function numberValue(value) {
  if (value === null || value === undefined) return null
  if (value === '') return 0
  const parsed = Number(String(value).replace('%', ''))
  return Number.isFinite(parsed) ? parsed : null
}

function totalMetric(fixture, stats, pick, events = null) {
  const homeName = fixture.teams?.home?.name
  const awayName = fixture.teams?.away?.name
  if (pick.marketType === 'corners') {
    return sideMetric(stats, pick.side, homeName, awayName, ['corner kicks'])
  }
  if (pick.marketType === 'cards') {
    const statCards = cardMetricFromStats(stats, pick.side, homeName, awayName)
    return statCards === null ? cardMetricFromEvents(events, pick.side, homeName, awayName) : statCards
  }
  if (pick.marketType === 'shots') {
    const names = normalize(pick.pick).includes('target') || normalize(pick.pick).includes('on goal')
      ? ['shots on goal']
      : ['total shots']
    return sideMetric(stats, pick.side, homeName, awayName, names)
  }
  return null
}

function cardMetricFromStats(stats, side, homeName, awayName) {
  const homeYellow = statValue(stats || [], homeName, ['yellow cards'])
  const awayYellow = statValue(stats || [], awayName, ['yellow cards'])
  const homeRed = statValue(stats || [], homeName, ['red cards'])
  const awayRed = statValue(stats || [], awayName, ['red cards'])
  if (homeYellow === null || awayYellow === null) return null
  const home = homeYellow + (homeRed ?? 0)
  const away = awayYellow + (awayRed ?? 0)
  if (side === 'home') return home
  if (side === 'away') return away
  return home + away
}

function cardMetricFromEvents(events, side, homeName, awayName) {
  if (!Array.isArray(events)) return null
  const cardEvents = events.filter((event) => normalize(event.type) === 'card')
  const countFor = (team) => cardEvents.filter((event) => sameTeam(normalize(event.team?.name), normalize(team))).length
  const home = countFor(homeName)
  const away = countFor(awayName)
  if (!cardEvents.length && !events.length) return null
  if (side === 'home') return home
  if (side === 'away') return away
  return home + away
}

function sideMetric(stats, side, homeName, awayName, names) {
  const home = statValue(stats || [], homeName, names)
  const away = statValue(stats || [], awayName, names)
  if (home === null || away === null) return null
  if (side === 'home') return home
  if (side === 'away') return away
  return home + away
}

function compareLine(value, direction, line) {
  if (line === null || line === undefined) return { settlement: 'Pendiente', reason: 'No se detecto linea del mercado.' }
  if (direction === 'over') return value > line ? win() : value === line ? voided() : loss()
  if (direction === 'under') return value < line ? win() : value === line ? voided() : loss()
  return { settlement: 'Pendiente', reason: 'No se detecto direccion over/under.' }
}

function settlePick(pick, fixture, stats, events = null, reversed = false) {
  if (!fixtureIsFinished(fixture)) {
    const reason = fixtureIsLive(fixture)
      ? liveReason(fixture)
      : `Fixture ${fixture.fixture?.status?.short || ''}: ${fixture.fixture?.status?.long || 'no finalizado'}.`
    return isBeforeToday(pick.fecha) ? noOfficialData(pick, reason, fixture) : pending(pick, reason, fixture)
  }

  const homeGoals = fixture.goals?.home
  const awayGoals = fixture.goals?.away
  const halfHome = fixture.score?.halftime?.home
  const halfAway = fixture.score?.halftime?.away
  let outcome

  if (pick.marketType === 'goals') {
    const total = pick.side === 'home' ? homeGoals : pick.side === 'away' ? awayGoals : homeGoals + awayGoals
    outcome = compareLine(total, pick.direction, pick.line)
  } else if (pick.marketType === 'first_half_goals') {
    outcome = compareLine(halfHome + halfAway, pick.direction, pick.line)
  } else if (pick.marketType === 'btts') {
    const both = homeGoals > 0 && awayGoals > 0
    outcome = pick.direction === 'yes' ? (both ? win() : loss()) : pick.direction === 'no' ? (!both ? win() : loss()) : pendingOutcome('No se detecto SI/NO en BTTS.')
  } else if (pick.marketType === 'winner') {
    const homeWin = homeGoals > awayGoals
    const awayWin = awayGoals > homeGoals
    const draw = homeGoals === awayGoals
    const label = normalize(pick.pick)
    const side = pickSide(pick)
    outcome = label.includes('empate') || label.includes('draw')
      ? (draw ? win() : loss())
      : side === 'home'
        ? (homeWin ? win() : loss())
        : side === 'away'
          ? (awayWin ? win() : loss())
          : pendingOutcome('No se detecto lado ganador.')
  } else if (pick.marketType === 'draw_no_bet') {
    const draw = homeGoals === awayGoals
    const side = pickSide(pick)
    outcome = draw ? voided() : side === 'home' ? (homeGoals > awayGoals ? win() : loss()) : side === 'away' ? (awayGoals > homeGoals ? win() : loss()) : pendingOutcome('No se detecto lado DNB.')
  } else if (needsFixtureStatistics(pick)) {
    const metric = totalMetric(fixture, stats, pick, events)
    outcome = metric === null ? pendingOutcome('API-Football no devolvio estadistica suficiente para este mercado.') : compareLine(metric, pick.direction, pick.line)
  } else {
    outcome = pendingOutcome('Mercado aun no soportado por el liquidador automatico.')
  }

  if (outcome.settlement === 'Pendiente') {
    return noOfficialData(pick, outcome.reason, fixture)
  }

  return {
    key: pick.key,
    settlement: outcome.settlement,
    source: 'API-Football',
    reason: reversed ? `${outcome.reason} Fixture encontrado con equipos invertidos respecto al reporte.` : outcome.reason,
    fixture: fixtureSummary(fixture),
  }
}

function pickSide(pick) {
  const label = normalize(pick.pick)
  if (pick.direction === 'home' || pick.side === 'home') return 'home'
  if (pick.direction === 'away' || pick.side === 'away') return 'away'
  if (label.includes('local') || label.includes('home') || label.includes('gana local')) return 'home'
  if (label.includes('visita') || label.includes('away') || label.includes('gana visita')) return 'away'
  return 'none'
}

function pending(pick, reason, fixture = null) {
  return {
    key: pick.key,
    settlement: 'Pendiente',
    source: 'API-Football',
    reason,
    fixture: fixture ? fixtureSummary(fixture) : null,
  }
}

function noOfficialData(pick, reason, fixture = null) {
  return {
    key: pick.key,
    settlement: 'Sin dato oficial',
    source: 'API-Football',
    reason: `${reason} Fecha pasada sin dato oficial suficiente para liquidar este mercado sin inventar resultado.`,
    fixture: fixture ? fixtureSummary(fixture) : null,
  }
}

function liveReason(fixture) {
  const status = fixture.fixture?.status || {}
  const score = fixtureScore(fixture)
  const minute = status.elapsed ? ` minuto ${status.elapsed}` : ''
  return `Partido en vivo${minute}: ${status.short || ''} ${status.long || ''}. Marcador provisional ${score || 'N/D'}. No se liquida hasta el final.`
}

function fixtureScore(fixture) {
  const homeGoals = fixture?.goals?.home
  const awayGoals = fixture?.goals?.away
  return homeGoals !== undefined && awayGoals !== undefined && homeGoals !== null && awayGoals !== null
    ? `${homeGoals}-${awayGoals}`
    : undefined
}

function fixtureSummary(fixture) {
  const halfHome = fixture?.score?.halftime?.home
  const halfAway = fixture?.score?.halftime?.away
  return {
    id: fixture.fixture?.id,
    status: fixture.fixture?.status?.short,
    statusLong: fixture.fixture?.status?.long,
    elapsed: fixture.fixture?.status?.elapsed,
    live: fixtureIsLive(fixture),
    score: fixtureScore(fixture),
    halftime: halfHome !== undefined || halfAway !== undefined ? `${halfHome ?? 'N/D'}-${halfAway ?? 'N/D'}` : undefined,
    home: fixture.teams?.home?.name,
    away: fixture.teams?.away?.name,
  }
}

function win() {
  return { settlement: 'Acertado', reason: 'Mercado liquidado como acertado.' }
}

function loss() {
  return { settlement: 'Fallado', reason: 'Mercado liquidado como fallado.' }
}

function voided() {
  return { settlement: 'Devuelto', reason: 'Apuesta devuelta: la seleccion no gana ni pierde y el stake se devuelve.' }
}

function pendingOutcome(reason) {
  return { settlement: 'Pendiente', reason }
}

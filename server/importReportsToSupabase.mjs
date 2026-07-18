import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const projectRoot = process.cwd()
loadEnv(path.join(projectRoot, '.env'))
loadEnv(path.resolve(projectRoot, '..', 'APUESTAS', '.env'), false)

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const sourceIndexUrl = process.env.VITE_PROTOCOL_INDEX_URL || 'https://ze-martin.github.io/'
const visibility = process.env.SUPABASE_REPORT_VISIBILITY || 'premium'

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL/VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env local.')
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

function inferDateFromSource(sourceLabel) {
  const match = sourceLabel.match(/(20\d{6})/)
  if (!match) return ''
  const raw = match[1]
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function reportDateFrom(sourceUrl, html) {
  const titleDate = html.match(/<h1[^>]*>[\s\S]*?(\d{4}-\d{2}-\d{2})[\s\S]*?<\/h1>/i)?.[1]
  return titleDate || inferDateFromSource(sourceUrl) || null
}

function inferLeagueFromTitle(title) {
  const normalized = String(title || '').trim()
  const withoutDate = normalized.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '').replace(/\s+-\s*$/g, '').trim()
  const parts = withoutDate.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
  const candidate = [...parts].reverse().find((part) => !/protocolo|reporte|completo|dashboard/i.test(part))
  if (!candidate || /mundial\s+2026/i.test(candidate)) return 'Liga no disponible'
  return candidate
}

function extractReportUrls(indexHtml, baseUrl) {
  return unique(
    Array.from(indexHtml.matchAll(/href=["']([^"']*reports\/[^"']+\.html)["']/gi))
      .map((match) => absoluteUrl(match[1], baseUrl)),
  ).sort((a, b) => inferDateFromSource(b).localeCompare(inferDateFromSource(a)))
}

function extractCells(rowHtml) {
  return Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => stripTags(match[1]))
}

function attr(rowHtml, name) {
  return rowHtml.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'))?.[1] ?? ''
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace('%', '').replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseHtmlReport(html, sourceUrl) {
  const reportDate = reportDateFrom(sourceUrl, html)
  const title = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? `Reporte ${reportDate ?? ''}`)
  const reportLeague = inferLeagueFromTitle(title)
  const marketsTable = html.match(/<table[^>]*id=["']markets["'][\s\S]*?<\/table>/i)?.[0] ?? html
  const headers = Array.from(marketsTable.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)).map((match) => stripTags(match[1]).toLowerCase())
  const hasDualOddsSchema = headers.some((header) => header.includes('betano'))

  const rows = Array.from(marketsTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => ({ rowHtml: match[0], cells: extractCells(match[1]) }))
    .filter(({ cells }) => cells.length >= 6)
    .map(({ rowHtml, cells }) => {
      if (hasDualOddsSchema) {
        return {
          fecha: reportDate ?? 'No disponible',
          hora: cells[1] ?? '',
          partido: cells[2] ?? '',
          league: attr(rowHtml, 'data-league') || attr(rowHtml, 'data-liga') || reportLeague,
          pick: cells[3] ?? '',
          market_original: cells[3] ?? '',
          probabilidad: cells[4] ?? '',
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
      }

      return {
        fecha: reportDate ?? 'No disponible',
        hora: cells[1] ?? '',
        partido: cells[2] ?? '',
        league: attr(rowHtml, 'data-league') || attr(rowHtml, 'data-liga') || reportLeague,
        bookmaker: 'API-Football/10Bet',
        pick: cells[3] ?? '',
        market_original: cells[3] ?? '',
        probabilidad: cells[4] ?? '',
        prob_num: cells[4] ?? '',
        cuota: cells[5] ?? '',
        ev: cells[6] ?? '',
        ev_num: cells[6] ?? '',
        estado: cells[7] ?? '',
        confianza: cells[8] ?? '',
        fuente: cells[9] ?? '',
        razon: cells[9] ?? '',
        riesgo: cells[10] ?? '',
      }
    })

  return { title, reportDate, rows }
}

async function fetchText(url) {
  const fetchUrl = new URL(url)
  fetchUrl.searchParams.set('_refresh', Date.now().toString())
  const response = await fetch(fetchUrl.toString(), { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status} leyendo ${url}`)
  return response.text()
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function importReport(url) {
  const html = await fetchText(url)
  const rawHash = hash(html)
  const parsed = parseHtmlReport(html, url)

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .upsert({
      source_url: url,
      source_label: path.basename(new URL(url).pathname),
      report_date: parsed.reportDate,
      title: parsed.title,
      raw_hash: rawHash,
      visibility,
      published_at: new Date().toISOString(),
    }, { onConflict: 'raw_hash' })
    .select('id')
    .single()

  if (reportError) throw new Error(`No se pudo insertar reporte ${url}: ${reportError.message}`)

  const { error: deleteError } = await supabase.from('picks').delete().eq('report_id', report.id)
  if (deleteError) throw new Error(`No se pudieron limpiar picks de ${url}: ${deleteError.message}`)

  const picks = parsed.rows.map((row) => ({
    report_id: report.id,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(row.fecha) ? row.fecha : null,
    event_time: row.hora || null,
    sport: row.sport || row.deporte || null,
    league: row.league || row.liga || null,
    match_name: row.partido || 'No disponible',
    market: row.market_original || row.pick || null,
    selection: row.pick || null,
    bookmaker: row.bookmaker_betano || row.bookmaker_api || row.bookmaker || null,
    probability: parseNumber(row.prob_num ?? row.probabilidad),
    odds: parseNumber(row.cuota_betano ?? row.cuota_api ?? row.cuota),
    ev: parseNumber(row.ev_betano ?? row.ev_api ?? row.ev_num ?? row.ev),
    confidence: row.confianza || null,
    risk: row.riesgo || null,
    raw_payload: row,
  }))

  if (picks.length) {
    const { error: picksError } = await supabase.from('picks').insert(picks)
    if (picksError) throw new Error(`No se pudieron insertar picks de ${url}: ${picksError.message}`)
  }

  return { url, picks: picks.length }
}

async function main() {
  const indexHtml = await fetchText(sourceIndexUrl)
  const reportUrls = extractReportUrls(indexHtml, sourceIndexUrl)
  if (!reportUrls.length) throw new Error(`No encontre reportes en ${sourceIndexUrl}`)

  let totalPicks = 0
  for (const url of reportUrls) {
    const result = await importReport(url)
    totalPicks += result.picks
    console.log(`${result.picks} picks importados desde ${result.url}`)
  }

  console.log(`Importacion completa: ${reportUrls.length} reportes, ${totalPicks} picks.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

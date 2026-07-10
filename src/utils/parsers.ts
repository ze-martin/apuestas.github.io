import Papa from 'papaparse'
import type {
  ConfidenceLevel,
  FinalRecommendation,
  PickStatus,
  ProtocolPrediction,
  RiskLevel,
} from '../types'

type LooseRecord = Record<string, unknown>

const aliases: Record<string, string[]> = {
  date: ['date', 'fecha', 'eventDate', 'event_date'],
  time: ['time', 'hora', 'eventTime', 'event_time'],
  sport: ['sport', 'deporte'],
  league: ['league', 'liga', 'competition', 'competicion'],
  event: ['event', 'partido', 'match', 'fixture', 'evento'],
  market: ['market', 'mercado'],
  selection: ['selection', 'seleccion', 'pick', 'pronostico', 'recomendacion_pick'],
  odds: ['odds', 'cuota', 'decimalOdds', 'cuota_decimal'],
  estimatedProbability: ['estimatedProbability', 'probabilidadEstimada', 'prob_estimada', 'estimated_probability'],
  confidence: ['confidence', 'confianza', 'nivel_confianza'],
  risk: ['risk', 'riesgo', 'nivel_riesgo'],
  stake: ['stake', 'stake_sugerido', 'suggestedStake'],
  recommendation: ['recommendation', 'recomendacion', 'finalRecommendation'],
  mainReason: ['mainReason', 'argumento', 'argumento_principal', 'motivo'],
  factorsFor: ['factorsFor', 'factores_a_favor', 'factoresFavor'],
  factorsAgainst: ['factorsAgainst', 'factores_en_contra', 'factoresContra'],
  alerts: ['alerts', 'alertas', 'senales_alerta'],
  status: ['status', 'estado'],
  result: ['result', 'resultado', 'marcador'],
  profitLoss: ['profitLoss', 'profit_loss', 'ganancia_perdida', 'pnl'],
  protocolResult: ['protocolResult', 'resultado_protocolo', 'protocolo'],
  observations: ['observations', 'observaciones', 'notes', 'notas'],
}

function pick(record: LooseRecord, field: string): unknown {
  const keys = aliases[field] ?? [field]
  const foundKey = keys.find((key) => record[key] !== undefined && record[key] !== '')
  return foundKey ? record[foundKey] : undefined
}

function asString(value: unknown, fallback = 'No disponible'): string {
  if (value === null || value === undefined || value === '') return fallback
  return String(value).trim()
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = typeof value === 'string' ? value.replace('%', '').replace(',', '.').trim() : value
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map((item) => asString(item)).filter(Boolean)
    } catch {
      return trimmed
        .split(/[;|]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

function normalizeConfidence(value: unknown): ConfidenceLevel {
  const text = asString(value).toLowerCase()
  if (text.includes('alta') || text === 'high') return 'Alta'
  if (text.includes('media') || text === 'medium') return 'Media'
  if (text.includes('baja') || text === 'low') return 'Baja'
  return 'No disponible'
}

function normalizeRisk(value: unknown): RiskLevel {
  const text = asString(value).toLowerCase()
  if (text.includes('alto') || text === 'high') return 'Alto'
  if (text.includes('medio') || text === 'medium') return 'Medio'
  if (text.includes('bajo') || text === 'low') return 'Bajo'
  return 'No disponible'
}

function normalizeStatus(value: unknown): PickStatus {
  const text = asString(value, 'Pendiente').toLowerCase()
  if (text.includes('acert') || text.includes('won') || text.includes('win')) return 'Acertado'
  if (text.includes('fall') || text.includes('lost') || text.includes('loss')) return 'Fallado'
  if (text.includes('void') || text.includes('push')) return 'Void'
  if (text.includes('descart') || text.includes('discard')) return 'Descartado'
  return 'Pendiente'
}

function normalizeRecommendation(value: unknown): FinalRecommendation {
  const text = asString(value).toLowerCase()
  if (text.includes('descart')) return 'Descartar'
  if (text.includes('esperar')) return 'Esperar mejor cuota'
  if (text.includes('cautela')) return 'Tomar con cautela'
  if (text.includes('tomar') || text.includes('take')) return 'Tomar'
  return 'No disponible'
}

export function normalizePrediction(
  record: LooseRecord,
  index: number,
  source: ProtocolPrediction['source'] = 'imported',
): ProtocolPrediction {
  const explanation = (record.explanation ?? record.explicabilidad ?? {}) as LooseRecord
  return {
    id: asString(record.id, `${source}-${Date.now()}-${index}`),
    source,
    date: asString(pick(record, 'date')),
    time: asString(pick(record, 'time'), ''),
    sport: asString(pick(record, 'sport')),
    league: asString(pick(record, 'league')),
    event: asString(pick(record, 'event')),
    market: asString(pick(record, 'market')),
    selection: asString(pick(record, 'selection')),
    odds: asNumber(pick(record, 'odds')),
    estimatedProbability: asNumber(pick(record, 'estimatedProbability')),
    confidence: normalizeConfidence(pick(record, 'confidence')),
    risk: normalizeRisk(pick(record, 'risk')),
    stake: asNumber(pick(record, 'stake')),
    recommendation: normalizeRecommendation(pick(record, 'recommendation')),
    mainReason: asString(pick(record, 'mainReason')),
    factorsFor: asArray(pick(record, 'factorsFor')),
    factorsAgainst: asArray(pick(record, 'factorsAgainst')),
    alerts: asArray(pick(record, 'alerts')),
    status: normalizeStatus(pick(record, 'status')),
    result: pick(record, 'result') === undefined ? null : asString(pick(record, 'result')),
    profitLoss: asNumber(pick(record, 'profitLoss')),
    protocolResult: asString(pick(record, 'protocolResult')),
    observations: asString(pick(record, 'observations'), ''),
    explanation: {
      recentForm: asString(explanation.recentForm ?? record.recentForm ?? record.forma_reciente),
      injuries: asString(explanation.injuries ?? record.injuries ?? record.lesiones_bajas),
      venue: asString(explanation.venue ?? record.venue ?? record.localia_visita),
      keyStats: asString(explanation.keyStats ?? record.keyStats ?? record.estadisticas_clave),
      marketTrend: asString(explanation.marketTrend ?? record.marketTrend ?? record.tendencia_mercado),
      oddsMovement: asString(explanation.oddsMovement ?? record.oddsMovement ?? record.movimiento_cuotas),
      headToHead: asString(explanation.headToHead ?? record.headToHead ?? record.historial),
      motivation: asString(explanation.motivation ?? record.motivation ?? record.contexto),
      risks: asString(explanation.risks ?? record.risks ?? record.riesgos_pronostico),
      invalidators: asString(explanation.invalidators ?? record.invalidators ?? record.variables_invalidan),
    },
    raw: record,
  }
}

function extractRows(payload: unknown): LooseRecord[] {
  if (Array.isArray(payload)) return payload as LooseRecord[]
  if (payload && typeof payload === 'object') {
    const record = payload as LooseRecord
    const candidate = record.predictions ?? record.picks ?? record.results ?? record.data
    if (Array.isArray(candidate)) return candidate as LooseRecord[]
    return [record]
  }
  return []
}

export function parseJsonText(text: string, source: ProtocolPrediction['source'] = 'manual'): ProtocolPrediction[] {
  const payload: unknown = JSON.parse(text)
  return extractRows(payload).map((row, index) => normalizePrediction(row, index, source))
}

export function parseCsvText(text: string, source: ProtocolPrediction['source'] = 'manual'): Promise<ProtocolPrediction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<LooseRecord>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data.map((row, index) => normalizePrediction(row, index, source))),
      error: (error: Error) => reject(error),
    })
  })
}

export async function parseProtocolText(text: string, source: ProtocolPrediction['source'] = 'manual') {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonText(trimmed, source)
  if (trimmed.startsWith('<')) return parseProtocolReportHtml(trimmed, 'manual-html')
  return parseCsvText(trimmed, source)
}

function textContent(row: Element, index: number) {
  return row.children[index]?.textContent?.trim() ?? ''
}

function percentToProbability(value: string) {
  const parsed = asNumber(value)
  if (parsed === null) return null
  return parsed > 1 ? parsed / 100 : parsed
}

function extractReportDate(document: Document, reportUrl: string) {
  const heading = document.querySelector('h1')?.textContent ?? ''
  const fromHeading = heading.match(/(\d{4}-\d{2}-\d{2})/)?.[1]
  if (fromHeading) return fromHeading

  const fromUrl = reportUrl.match(/(20\d{6})/)?.[1]
  if (!fromUrl) return 'No disponible'
  return `${fromUrl.slice(0, 4)}-${fromUrl.slice(4, 6)}-${fromUrl.slice(6, 8)}`
}

function extractReportLeague(document: Document) {
  const heading = document.querySelector('h1')?.textContent ?? ''
  const match = heading.match(/Protocolo completo\s*-\s*(.*?)\s*-\s*\d{4}-\d{2}-\d{2}/)
  return match?.[1]?.trim() || 'Protocolo Apuestas'
}

function inferMarket(selection: string) {
  const text = selection.toLowerCase()
  if (text.includes('corner')) return 'Corners'
  if (text.includes('tarjeta')) return 'Tarjetas'
  if (text.includes('gol') || text.includes('btts') || text.includes('team_total')) return 'Goles'
  if (text.includes('1t')) return 'Primer tiempo'
  if (text.includes('1x2') || text.includes('gana') || text.includes('dnb') || text.includes('double_chance')) {
    return 'Resultado'
  }
  if (text.includes('shot')) return 'Tiros'
  return 'Mercado del protocolo'
}

function inferRiskLevel(
  protocolState: string,
  confidence: ConfidenceLevel,
  riskText: string,
  probability: number | null,
  protocolEv: number | null,
): RiskLevel {
  const state = protocolState.toLowerCase()
  if (confidence === 'Alta' && (probability ?? 0) > 0.7) {
    if (state.includes('positivo') && (protocolEv ?? 0) > 0) return riskText ? 'Medio' : 'Bajo'
    if (state.includes('sin cuota')) return 'Medio'
    if (state.includes('negativo')) return 'Medio'
    return 'Bajo'
  }

  if (state.includes('sin cuota')) return 'Medio'
  if (state.includes('negativo')) return (probability ?? 0) >= 0.6 ? 'Medio' : 'Alto'
  if (confidence === 'Baja') return 'Alto'
  if (confidence === 'Media') return 'Medio'
  return riskText ? 'Medio' : 'Bajo'
}

function inferRecommendation(protocolState: string, confidence: ConfidenceLevel, risk: RiskLevel): FinalRecommendation {
  const state = protocolState.toLowerCase()
  if (state.includes('negativo')) return 'Descartar'
  if (state.includes('sin cuota')) return 'Esperar mejor cuota'
  if (state.includes('positivo') && confidence === 'Alta' && risk !== 'Alto') return 'Tomar'
  if (state.includes('positivo')) return 'Tomar con cautela'
  return 'No disponible'
}

export function parseProtocolReportHtml(reportHtml: string, reportUrl = 'manual-html'): ProtocolPrediction[] {
  const document = new DOMParser().parseFromString(reportHtml, 'text/html')
  const rows = Array.from(document.querySelectorAll('#markets tbody tr'))
  const reportDate = extractReportDate(document, reportUrl)
  const league = extractReportLeague(document)
  const generated = document.querySelector('.meta')?.textContent?.trim() ?? ''

  return rows.map((row, index) => {
    const time = textContent(row, 1)
    const event = textContent(row, 2)
    const selection = textContent(row, 3)
    const estimatedProbability = percentToProbability(textContent(row, 4))
    const odds = asNumber(textContent(row, 5))
    const protocolEv = asNumber(textContent(row, 6))
    const protocolState = textContent(row, 7)
    const confidence = normalizeConfidence(textContent(row, 8))
    const sourceText = textContent(row, 9)
    const riskText = textContent(row, 10)
    const risk = inferRiskLevel(protocolState, confidence, riskText, estimatedProbability, protocolEv)
    const recommendation = inferRecommendation(protocolState, confidence, risk)

    return {
      id: `github-pages-${reportDate}-${index + 1}`,
      source: 'imported',
      date: reportDate,
      time,
      sport: 'Futbol',
      league,
      event,
      market: inferMarket(selection),
      selection,
      odds,
      estimatedProbability,
      confidence,
      risk,
      stake: null,
      recommendation,
      mainReason: `${protocolState || 'Lectura del protocolo'} segun reporte publicado. Fuente: ${
        sourceText || 'No disponible'
      }.`,
      factorsFor: [
        estimatedProbability !== null ? `Probabilidad estimada ${(estimatedProbability * 100).toFixed(1)}%` : '',
        protocolEv !== null && protocolEv > 0 ? `EV positivo reportado: ${protocolEv.toFixed(2)}` : '',
        sourceText ? `Fuente: ${sourceText}` : '',
      ].filter(Boolean),
      factorsAgainst: [
        riskText,
        protocolEv !== null && protocolEv < 0 ? `EV negativo reportado: ${protocolEv.toFixed(2)}` : '',
        odds === null ? 'No hay cuota disponible en el reporte' : '',
      ].filter(Boolean),
      alerts: [
        'Confirmar cuotas vigentes antes de ejecutar el pick',
        odds === null ? 'Esperar cuota disponible para calcular edge operativo' : '',
        'Validar alineaciones, contexto competitivo y cambios de mercado',
      ].filter(Boolean),
      status: 'Pendiente',
      result: null,
      profitLoss: null,
      protocolResult: protocolState || 'No disponible',
      observations: `Importado desde ${reportUrl}. ${generated}`,
      explanation: {
        recentForm: 'No disponible en el reporte HTML publicado.',
        injuries: 'No disponible en el reporte HTML publicado.',
        venue: 'No disponible en el reporte HTML publicado.',
        keyStats: `Probabilidad del protocolo: ${
          estimatedProbability !== null ? `${(estimatedProbability * 100).toFixed(1)}%` : 'No disponible'
        }. EV reportado: ${protocolEv !== null ? protocolEv.toFixed(2) : 'No disponible'}.`,
        marketTrend: 'No disponible en el reporte HTML publicado.',
        oddsMovement: odds !== null ? `Cuota publicada: ${odds.toFixed(2)}` : 'Sin cuota publicada.',
        headToHead: 'No disponible en el reporte HTML publicado.',
        motivation: sourceText || 'No disponible',
        risks: riskText || 'No disponible',
        invalidators:
          'Cambio fuerte de cuota, bajas relevantes, alineaciones inesperadas o lectura de mercado desactualizada.',
      },
      raw: {
        reportUrl,
        rowNumber: index + 1,
        protocolEv,
        protocolState,
        sourceText,
        riskText,
      },
    }
  })
}

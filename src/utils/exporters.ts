import type { ProtocolPrediction } from '../types'
import { edge, expectedValue, formatPercent, impliedProbability } from './metrics'

const headers = [
  'date',
  'time',
  'sport',
  'league',
  'event',
  'market',
  'selection',
  'odds',
  'estimatedProbability',
  'impliedProbability',
  'edge',
  'expectedValue',
  'confidence',
  'risk',
  'stake',
  'protocolResult',
  'status',
  'result',
  'profitLoss',
  'observations',
]

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export function predictionsToCsv(predictions: ProtocolPrediction[]): string {
  const rows = predictions.map((item) => [
    item.date,
    item.time,
    item.sport,
    item.league,
    item.event,
    item.market,
    item.selection,
    item.odds,
    item.estimatedProbability,
    impliedProbability(item.odds),
    edge(item),
    expectedValue(item),
    item.confidence,
    item.risk,
    item.stake,
    item.protocolResult,
    item.status,
    item.result,
    item.profitLoss,
    item.observations,
  ])
  return [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n')
}

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function executiveMarkdown(predictions: ProtocolPrediction[]): string {
  const active = predictions.filter(
    (item) => item.recommendation === 'Tomar' || item.recommendation === 'Tomar con cautela',
  )
  const top = [...active]
    .sort((a, b) => (edge(b) ?? -1) - (edge(a) ?? -1))
    .slice(0, 3)
  const discarded = predictions.filter((item) => item.status === 'Descartado' || item.recommendation === 'Descartar')

  const topText = top
    .map(
      (item, index) =>
        `${index + 1}. ${item.event} | ${item.selection} | cuota ${item.odds ?? 'N/D'} | confianza ${item.confidence} | edge ${formatPercent(edge(item))}`,
    )
    .join('\n')

  const discardedText = discarded
    .map((item) => `- ${item.event}: ${item.mainReason || item.observations || 'Sin motivo informado'}`)
    .join('\n')

  return `# Informe del dia - Protocolo Apuestas

> Herramienta analitica. No garantiza ganancias. Juega responsablemente y solo si eres mayor de edad segun tu normativa local.

## Top picks recomendados
${topText || 'No hay picks recomendados disponibles.'}

## Picks descartados
${discardedText || 'No hay picks descartados.'}

## Resumen
Se analizaron ${predictions.length} registros. Priorizar picks con edge positivo, confianza documentada y alertas revisadas antes del evento. Evitar aumentar stake por rachas recientes.`
}

import type { ConfidenceLevel, ProtocolPrediction, RiskLevel, StakeMode } from '../types'

const confidenceScore: Record<ConfidenceLevel, number> = {
  Alta: 3,
  Media: 2,
  Baja: 1,
  'No disponible': 0,
}

const riskScore: Record<RiskLevel, number> = {
  Alto: 3,
  Medio: 2,
  Bajo: 1,
  'No disponible': 0,
}

export function toProbability(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null
  if (value > 1) return value / 100
  if (value < 0) return 0
  return value
}

export function impliedProbability(odds: number | null): number | null {
  if (!odds || odds <= 1) return null
  return 1 / odds
}

export function edge(prediction: ProtocolPrediction): number | null {
  const estimated = toProbability(prediction.estimatedProbability)
  const implied = impliedProbability(prediction.odds)
  if (estimated === null || implied === null) return null
  return estimated - implied
}

export function expectedValue(prediction: ProtocolPrediction): number | null {
  const estimated = toProbability(prediction.estimatedProbability)
  if (estimated === null || !prediction.odds || prediction.odds <= 1) return null
  return estimated * (prediction.odds - 1) - (1 - estimated)
}

export function suggestedStake(
  prediction: ProtocolPrediction,
  mode: StakeMode,
  fixedStake: number,
  bankroll: number,
): number {
  if (prediction.status === 'Descartado' || prediction.recommendation === 'Descartar') return 0
  if (mode === 'fixed') return Math.max(0, fixedStake)

  const estimated = toProbability(prediction.estimatedProbability)
  if (estimated === null || !prediction.odds || prediction.odds <= 1) return prediction.stake ?? fixedStake
  const b = prediction.odds - 1
  const q = 1 - estimated
  const fullKelly = (b * estimated - q) / b
  const conservativeFraction = Math.max(0, fullKelly) * 0.25
  const stakeUnits = (bankroll * conservativeFraction) / 100
  return Math.min(3, Number(stakeUnits.toFixed(2)))
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return 'No disponible'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatNumber(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return 'No disponible'
  return value.toFixed(digits)
}

export function getConfidenceScore(confidence: ConfidenceLevel): number {
  return confidenceScore[confidence]
}

export function getRiskScore(risk: RiskLevel): number {
  return riskScore[risk]
}

export function calculatedProfitLoss(prediction: ProtocolPrediction): number | null {
  if (prediction.profitLoss !== null) return prediction.profitLoss
  if (!prediction.stake || !prediction.odds) return null
  if (prediction.status === 'Acertado') return prediction.stake * (prediction.odds - 1)
  if (prediction.status === 'Fallado') return -prediction.stake
  if (prediction.status === 'Void' || prediction.status === 'Descartado') return 0
  return null
}

export function roi(predictions: ProtocolPrediction[]): number | null {
  const settled = predictions.filter((item) => ['Acertado', 'Fallado', 'Void'].includes(item.status))
  const totalStake = settled.reduce((sum, item) => sum + (item.stake ?? 0), 0)
  if (totalStake <= 0) return null
  const profit = settled.reduce((sum, item) => sum + (calculatedProfitLoss(item) ?? 0), 0)
  return profit / totalStake
}

export function hitRate(predictions: ProtocolPrediction[]): number | null {
  const graded = predictions.filter((item) => item.status === 'Acertado' || item.status === 'Fallado')
  if (!graded.length) return null
  return graded.filter((item) => item.status === 'Acertado').length / graded.length
}

export function dayProfile(predictions: ProtocolPrediction[]): 'Dia conservador' | 'Dia moderado' | 'Dia agresivo' {
  const active = predictions.filter((item) => item.status !== 'Descartado')
  if (!active.length) return 'Dia conservador'
  const avgRisk = active.reduce((sum, item) => sum + getRiskScore(item.risk), 0) / active.length
  const highRiskRatio = active.filter((item) => item.risk === 'Alto').length / active.length
  if (avgRisk >= 2.35 || highRiskRatio >= 0.35) return 'Dia agresivo'
  if (avgRisk >= 1.65) return 'Dia moderado'
  return 'Dia conservador'
}

export function groupCount(predictions: ProtocolPrediction[], key: keyof ProtocolPrediction) {
  return predictions.reduce<Record<string, number>>((acc, item) => {
    const label = String(item[key] || 'No disponible')
    acc[label] = (acc[label] ?? 0) + 1
    return acc
  }, {})
}

export function performanceBy(predictions: ProtocolPrediction[], key: keyof ProtocolPrediction) {
  const groups = predictions.reduce<Record<string, ProtocolPrediction[]>>((acc, item) => {
    const label = String(item[key] || 'No disponible')
    acc[label] = [...(acc[label] ?? []), item]
    return acc
  }, {})

  return Object.entries(groups).map(([name, items]) => ({
    name,
    picks: items.length,
    roi: roi(items),
    hitRate: hitRate(items),
    profit: items.reduce((sum, item) => sum + (calculatedProfitLoss(item) ?? 0), 0),
  }))
}

export function bankrollSeries(predictions: ProtocolPrediction[], initialBankroll: number) {
  let current = initialBankroll
  return [...predictions]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .map((item) => {
      current += calculatedProfitLoss(item) ?? 0
      return {
        name: `${item.date} ${item.event}`,
        bankroll: Number(current.toFixed(2)),
        profit: calculatedProfitLoss(item) ?? 0,
      }
    })
}

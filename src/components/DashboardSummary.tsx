import { AlertTriangle, Gauge, Target, TrendingUp } from 'lucide-react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ProtocolPrediction } from '../types'
import {
  dayProfile,
  edge,
  formatPercent,
  groupCount,
  impliedProbability,
  suggestedStake,
  toProbability,
} from '../utils/metrics'
import { Badge } from './Badge'

const palette = ['#0f766e', '#2563eb', '#f59e0b', '#e11d48', '#64748b', '#7c3aed']

function countChart(predictions: ProtocolPrediction[], key: keyof ProtocolPrediction) {
  return Object.entries(groupCount(predictions, key)).map(([name, value]) => ({ name, value }))
}

export function DashboardSummary({
  predictions,
  stakeMode,
  fixedStake,
  bankroll,
}: {
  predictions: ProtocolPrediction[]
  stakeMode: 'fixed' | 'kelly'
  fixedStake: number
  bankroll: number
}) {
  const recommended = predictions.filter(
    (item) => item.recommendation === 'Tomar' || item.recommendation === 'Tomar con cautela',
  )
  const highConfidence = predictions.filter((item) => item.confidence === 'Alta')
  const highRisk = predictions.filter((item) => item.risk === 'Alto')
  const uniqueEvents = new Set(predictions.map((item) => `${item.date}-${item.event}`)).size
  const avgConfidence =
    predictions.reduce((sum, item) => sum + (toProbability(item.estimatedProbability) ?? 0), 0) /
    Math.max(1, predictions.filter((item) => item.estimatedProbability !== null).length)
  const best = [...recommended].sort((a, b) => (edge(b) ?? -1) - (edge(a) ?? -1))[0]
  const profile = dayProfile(predictions)

  const cards = [
    { label: 'Partidos analizados', value: uniqueEvents, icon: Target },
    { label: 'Pronosticos recomendados', value: recommended.length, icon: TrendingUp },
    { label: 'Alta confianza', value: highConfidence.length, icon: Gauge },
    { label: 'Riesgo alto', value: highRisk.length, icon: AlertTriangle },
  ]

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
              <card.icon className="h-5 w-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Indicador general</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold text-slate-950 dark:text-white">{profile}</span>
            <Badge label={profile.includes('agresivo') ? 'Mayor cautela' : 'Control de riesgo'} tone={profile.includes('agresivo') ? 'Alto' : 'Bajo'} />
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Promedio de probabilidad estimada: <strong>{formatPercent(avgConfidence)}</strong>
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Mejor oportunidad del dia</p>
          {best ? (
            <div className="mt-3 space-y-2">
              <h3 className="font-semibold text-slate-950 dark:text-white">{best.event}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {best.selection} · cuota {best.odds ?? 'N/D'} · edge {formatPercent(edge(best))}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Implicita {formatPercent(impliedProbability(best.odds))} · stake sugerido{' '}
                {suggestedStake(best, stakeMode, fixedStake, bankroll).toFixed(2)} u
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No hay picks recomendados.</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Distribucion por riesgo</p>
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={countChart(predictions, 'risk')} dataKey="value" nameKey="name" outerRadius={58}>
                  {countChart(predictions, 'risk').map((entry, index) => (
                    <Cell key={entry.name} fill={palette[index % palette.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {(['sport', 'league', 'market'] as const).map((key) => (
          <div
            key={key}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Distribucion por {key === 'sport' ? 'deporte' : key === 'league' ? 'liga' : 'mercado'}
            </p>
            <div className="space-y-2">
              {countChart(predictions, key).map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 text-sm">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: palette[index % palette.length] }} />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{item.name}</span>
                  <span className="font-semibold text-slate-950 dark:text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

import { Link2, ShieldAlert } from 'lucide-react'
import type { ProtocolPrediction } from '../types'
import { edge, formatPercent, toProbability } from '../utils/metrics'
import { Badge } from './Badge'

interface Parlay {
  event: string
  date: string
  time: string
  league: string
  legs: ProtocolPrediction[]
  combinedOdds: number
  approximateProbability: number
}

function parlayCandidates(predictions: ProtocolPrediction[]) {
  return predictions.filter((item) => {
    const probability = toProbability(item.estimatedProbability)
    return (
      probability !== null &&
      probability > 0.7 &&
      item.odds !== null &&
      item.odds > 1 &&
      item.protocolResult.toLowerCase().includes('positivo') &&
      (item.recommendation === 'Tomar' || item.recommendation === 'Tomar con cautela')
    )
  })
}

function buildParlays(predictions: ProtocolPrediction[]): Parlay[] {
  const grouped = parlayCandidates(predictions).reduce<Record<string, ProtocolPrediction[]>>((acc, item) => {
    const key = `${item.date}-${item.event}`
    acc[key] = [...(acc[key] ?? []), item]
    return acc
  }, {})

  return Object.values(grouped)
    .map((items) => {
      const uniqueMarketLegs = [...items]
        .sort((a, b) => {
          const probDiff = (toProbability(b.estimatedProbability) ?? 0) - (toProbability(a.estimatedProbability) ?? 0)
          return probDiff || (edge(b) ?? -999) - (edge(a) ?? -999)
        })
        .reduce<ProtocolPrediction[]>((acc, item) => {
          if (acc.some((selected) => selected.market === item.market)) return acc
          return [...acc, item]
        }, [])
        .slice(0, 3)

      const legs = uniqueMarketLegs.length >= 2 ? uniqueMarketLegs : items.slice(0, 3)
      if (legs.length < 2) return null

      return {
        event: legs[0].event,
        date: legs[0].date,
        time: legs[0].time,
        league: legs[0].league,
        legs,
        combinedOdds: legs.reduce((product, item) => product * (item.odds ?? 1), 1),
        approximateProbability: legs.reduce((product, item) => product * (toProbability(item.estimatedProbability) ?? 0), 1),
      }
    })
    .filter((item): item is Parlay => item !== null)
}

export function ParlayRecommendations({ predictions }: { predictions: ProtocolPrediction[] }) {
  const parlays = buildParlays(predictions)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-teal-700 dark:text-teal-300">
            Parlays por partido
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Combinadas sugeridas</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Solo usa picks con probabilidad mayor a 70%, cuota disponible y EV positivo reportado.
          </p>
        </div>
        <Badge label={`${parlays.length} parlays`} tone={parlays.length ? 'positive' : undefined} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {parlays.length ? (
          parlays.map((parlay) => (
            <article key={`${parlay.date}-${parlay.event}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950 dark:text-white">{parlay.event}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {parlay.date} {parlay.time} · {parlay.league}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Cuota combinada</p>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">{parlay.combinedOdds.toFixed(2)}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {parlay.legs.map((leg, index) => (
                  <div key={leg.id} className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                    <div className="flex items-start gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-teal-700 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-950 dark:text-white">{leg.selection}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {leg.market} · cuota {leg.odds?.toFixed(2)} · prob. {formatPercent(leg.estimatedProbability)} · edge{' '}
                          {formatPercent(edge(leg))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Probabilidad aproximada</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {formatPercent(parlay.approximateProbability)} antes de ajustar correlacion.
                  </p>
                </div>
                <div className="rounded-md bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    <p className="text-sm font-semibold">Cautela</p>
                  </div>
                  <p className="mt-1 text-sm">Mismo partido implica correlacion. Usar stake menor que en picks simples.</p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
            No hay suficientes picks con cuota, EV positivo y probabilidad mayor a 70% para armar parlays por partido.
          </div>
        )}
      </div>
    </section>
  )
}

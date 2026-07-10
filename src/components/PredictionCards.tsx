import { AlertCircle, CheckCircle2, CircleSlash, ShieldAlert } from 'lucide-react'
import type { ProtocolPrediction } from '../types'
import { edge, formatPercent, suggestedStake } from '../utils/metrics'
import { Badge } from './Badge'

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{title}</p>
      {items.length ? (
        <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
          {items.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No disponible</p>
      )}
    </div>
  )
}

export function PredictionCards({
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
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {predictions.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-normal text-slate-500 dark:text-slate-400">
                {item.sport} · {item.league} · {item.date} {item.time}
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{item.event}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.market}</p>
            </div>
            {item.source === 'mock' && <Badge label="Mock" tone="mock" />}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs text-slate-500">Pick</p>
              <p className="font-semibold text-slate-950 dark:text-white">{item.selection}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs text-slate-500">Cuota</p>
              <p className="font-semibold text-slate-950 dark:text-white">{item.odds ?? 'N/D'}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs text-slate-500">Stake</p>
              <p className="font-semibold text-slate-950 dark:text-white">
                {suggestedStake(item, stakeMode, fixedStake, bankroll).toFixed(2)} u
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs text-slate-500">Edge</p>
              <p className="font-semibold text-slate-950 dark:text-white">{formatPercent(edge(item))}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge label={`Confianza: ${item.confidence}`} tone={item.confidence} />
            <Badge label={`Riesgo: ${item.risk}`} tone={item.risk} />
            <Badge label={`Estado: ${item.status}`} tone={item.status} />
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden="true" />
              <p className="font-semibold text-slate-950 dark:text-white">Argumento principal</p>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200">{item.mainReason}</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <ListBlock title="Factores a favor" items={item.factorsFor} />
            <ListBlock title="Factores en contra" items={item.factorsAgainst} />
            <ListBlock title="Senales de alerta" items={item.alerts} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ['Forma reciente', item.explanation.recentForm],
              ['Lesiones o bajas', item.explanation.injuries],
              ['Localia / visita', item.explanation.venue],
              ['Estadisticas clave', item.explanation.keyStats],
              ['Tendencia de mercado', item.explanation.marketTrend],
              ['Movimiento de cuotas', item.explanation.oddsMovement],
              ['Historial entre equipos', item.explanation.headToHead],
              ['Motivacion / contexto', item.explanation.motivation],
              ['Riesgos', item.explanation.risks],
              ['Variables invalidantes', item.explanation.invalidators],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <p className="font-semibold text-slate-900 dark:text-white">{label}</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{value || 'No disponible'}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-950 p-3 text-white dark:bg-slate-800">
            {item.recommendation === 'Descartar' ? (
              <CircleSlash className="h-5 w-5 text-rose-300" aria-hidden="true" />
            ) : item.risk === 'Alto' ? (
              <ShieldAlert className="h-5 w-5 text-amber-300" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-5 w-5 text-teal-300" aria-hidden="true" />
            )}
            <span className="text-sm font-semibold">Recomendacion final: {item.recommendation}</span>
          </div>
        </article>
      ))}
    </section>
  )
}

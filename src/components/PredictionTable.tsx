import { ArrowUpDown, Search } from 'lucide-react'
import type { Filters, ProtocolPrediction, SortKey } from '../types'
import { edge, expectedValue, formatNumber, formatPercent, impliedProbability, suggestedStake } from '../utils/metrics'
import { Badge } from './Badge'

const filterOptions = ['sport', 'league', 'market', 'confidence', 'risk', 'status'] as const

function uniqueValues(predictions: ProtocolPrediction[], key: (typeof filterOptions)[number]) {
  return Array.from(new Set(predictions.map((item) => String(item[key] || 'No disponible')))).sort()
}

export function PredictionTable({
  predictions,
  allPredictions,
  filters,
  setFilters,
  sortKey,
  setSortKey,
  compact,
  setCompact,
  stakeMode,
  fixedStake,
  bankroll,
}: {
  predictions: ProtocolPrediction[]
  allPredictions: ProtocolPrediction[]
  filters: Filters
  setFilters: (filters: Filters) => void
  sortKey: SortKey
  setSortKey: (sort: SortKey) => void
  compact: boolean
  setCompact: (value: boolean) => void
  stakeMode: 'fixed' | 'kelly'
  fixedStake: number
  bankroll: number
}) {
  const headers: { key: SortKey; label: string }[] = [
    { key: 'date', label: 'Fecha' },
    { key: 'confidence', label: 'Confianza' },
    { key: 'edge', label: 'Edge' },
    { key: 'odds', label: 'Cuota' },
    { key: 'league', label: 'Liga' },
    { key: 'risk', label: 'Riesgo' },
  ]

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Tabla inteligente de pronosticos</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{predictions.length} filas visibles</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={compact}
              onChange={(event) => setCompact(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-700"
            />
            Vista compacta
          </label>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_repeat(3,1fr)] xl:grid-cols-[1.5fr_repeat(6,1fr)]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              value={filters.query}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              placeholder="Buscar equipo o partido"
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          {filterOptions.map((key) => (
            <select
              key={key}
              value={filters[key]}
              onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              aria-label={`Filtrar por ${key}`}
            >
              <option value="">Todos: {key}</option>
              {uniqueValues(allPredictions, key).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {headers.map((header) => (
            <button
              key={header.key}
              type="button"
              onClick={() => setSortKey(header.key)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                sortKey === header.key
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
              {header.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1280px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3">Mercado</th>
              <th className="px-4 py-3">Pick</th>
              <th className="px-4 py-3">Cuota</th>
              <th className="px-4 py-3">Prob.</th>
              <th className="px-4 py-3">Implicita</th>
              <th className="px-4 py-3">Edge / EV</th>
              <th className="px-4 py-3">Confianza</th>
              <th className="px-4 py-3">Riesgo</th>
              <th className="px-4 py-3">Stake</th>
              <th className="px-4 py-3">Protocolo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {predictions.map((item) => {
              const itemEdge = edge(item)
              const important = item.confidence === 'Alta' && (itemEdge ?? 0) > 0
              return (
                <tr key={item.id} className={important ? 'bg-teal-50/60 dark:bg-teal-950/20' : ''}>
                  <td className={`px-4 ${compact ? 'py-3' : 'py-4'}`}>
                    <div className="font-semibold text-slate-950 dark:text-white">{item.event}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {item.date} {item.time} · {item.sport} · {item.league}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.market}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950 dark:text-white">{item.selection}</td>
                  <td className="px-4 py-3">{formatNumber(item.odds)}</td>
                  <td className="px-4 py-3">{formatPercent(item.estimatedProbability)}</td>
                  <td className="px-4 py-3">{formatPercent(impliedProbability(item.odds))}</td>
                  <td className="px-4 py-3">
                    <Badge label={formatPercent(itemEdge)} tone={(itemEdge ?? 0) >= 0 ? 'positive' : 'negative'} />
                    <div className="mt-1 text-xs text-slate-500">EV {formatPercent(expectedValue(item))}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={item.confidence} tone={item.confidence} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={item.risk} tone={item.risk} />
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {suggestedStake(item, stakeMode, fixedStake, bankroll).toFixed(2)} u
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={item.protocolResult} tone={item.protocolResult.includes('positivo') ? 'positive' : item.protocolResult.includes('negativo') ? 'negative' : undefined} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={item.status} tone={item.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {compact ? item.source : item.observations || 'No disponible'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

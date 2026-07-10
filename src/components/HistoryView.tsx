import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, CartesianGrid } from 'recharts'
import type { ProtocolPrediction } from '../types'
import { bankrollSeries, calculatedProfitLoss, formatPercent, hitRate, performanceBy, roi } from '../utils/metrics'
import { Badge } from './Badge'

export function HistoryView({ predictions, initialBankroll }: { predictions: ProtocolPrediction[]; initialBankroll: number }) {
  const settled = predictions.filter((item) => ['Acertado', 'Fallado', 'Void', 'Descartado'].includes(item.status))
  const recommended = predictions.filter((item) => item.status !== 'Descartado')
  const discarded = predictions.filter((item) => item.status === 'Descartado')
  const series = bankrollSeries(settled, initialBankroll)
  const byMarket = performanceBy(settled, 'market')

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500">ROI historico</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{formatPercent(roi(settled))}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500">Tasa de acierto</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{formatPercent(hitRate(settled))}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500">Picks recomendados</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{recommended.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500">Picks descartados</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{discarded.length}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Evolucion de bankroll simulado</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#33415533" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="bankroll" stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Rendimiento por mercado</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <BarChart data={byMarket}>
                <CartesianGrid strokeDasharray="3 3" stroke="#33415533" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => (typeof value === 'number' ? value.toFixed(2) : value)} />
                <Bar dataKey="profit" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Picks anteriores y seguimiento</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Mercado</th>
                <th className="px-4 py-3">Pick</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Ganancia/perdida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {settled.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{item.date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950 dark:text-white">{item.event}</td>
                  <td className="px-4 py-3">{item.market}</td>
                  <td className="px-4 py-3">{item.selection}</td>
                  <td className="px-4 py-3">
                    <Badge label={item.status} tone={item.status} />
                  </td>
                  <td className="px-4 py-3">{item.result ?? 'No disponible'}</td>
                  <td className="px-4 py-3 font-semibold">{(calculatedProfitLoss(item) ?? 0).toFixed(2)} u</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

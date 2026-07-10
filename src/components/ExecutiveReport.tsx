import { Copy, FileDown, Printer } from 'lucide-react'
import type { ProtocolPrediction } from '../types'
import { executiveMarkdown, downloadText } from '../utils/exporters'
import { edge, formatPercent } from '../utils/metrics'
import { Badge } from './Badge'

export function ExecutiveReport({ predictions }: { predictions: ProtocolPrediction[] }) {
  const active = predictions.filter(
    (item) => item.recommendation === 'Tomar' || item.recommendation === 'Tomar con cautela',
  )
  const top = [...active].sort((a, b) => (edge(b) ?? -1) - (edge(a) ?? -1)).slice(0, 3)
  const conservative = active.filter((item) => item.risk === 'Bajo' || (item.confidence === 'Alta' && item.risk !== 'Alto'))
  const valueRisk = active.filter((item) => item.risk === 'Alto' && (edge(item) ?? 0) > 0)
  const discarded = predictions.filter((item) => item.status === 'Descartado' || item.recommendation === 'Descartar')
  const markdown = executiveMarkdown(predictions)

  async function copyReport() {
    await navigator.clipboard.writeText(markdown)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Informe del dia</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Resumen listo para WhatsApp, Telegram o correo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyReport()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar texto
          </button>
          <button
            type="button"
            onClick={() => downloadText('informe-protocolo-apuestas.md', markdown, 'text/markdown;charset=utf-8')}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBlock title="Top 3 picks recomendados" items={top} />
        <ReportBlock title="Picks conservadores" items={conservative.slice(0, 5)} />
        <ReportBlock title="Valor con riesgo" items={valueRisk.slice(0, 5)} />
        <ReportBlock title="Picks descartados y motivo" items={discarded.slice(0, 5)} showReason />
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>Advertencia general:</strong> revisar alineaciones, lesiones, movimiento de cuotas y limites de stake antes de ejecutar cualquier pick. Esta app no promete ganancias.
      </div>

      <textarea
        readOnly
        value={markdown}
        className="min-h-72 w-full rounded-lg border border-slate-300 bg-white p-4 font-mono text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </section>
  )
}

function ReportBlock({
  title,
  items,
  showReason = false,
}: {
  title: string
  items: ProtocolPrediction[]
  showReason?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="border-l-2 border-teal-700 pl-3">
              <p className="font-semibold text-slate-950 dark:text-white">{item.event}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {item.selection} · cuota {item.odds ?? 'N/D'} · edge {formatPercent(edge(item))}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge label={item.confidence} tone={item.confidence} />
                <Badge label={item.risk} tone={item.risk} />
              </div>
              {showReason && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.mainReason}</p>}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No disponible</p>
        )}
      </div>
    </div>
  )
}

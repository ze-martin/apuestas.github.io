import type { ConfidenceLevel, PickStatus, RiskLevel } from '../types'

const confidenceStyles: Record<ConfidenceLevel, string> = {
  Alta: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  Media: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  Baja: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  'No disponible': 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300',
}

const riskStyles: Record<RiskLevel, string> = {
  Bajo: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  Medio: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  Alto: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200',
  'No disponible': 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300',
}

const statusStyles: Record<PickStatus, string> = {
  Pendiente: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-200',
  Acertado: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  Fallado: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200',
  Void: 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-200',
  Descartado: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-200',
}

export function Badge({
  label,
  tone,
}: {
  label: string
  tone?: ConfidenceLevel | RiskLevel | PickStatus | 'mock' | 'positive' | 'negative'
}) {
  const custom =
    tone === 'mock'
      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200'
      : tone === 'positive'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
        : tone === 'negative'
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
          : ''
  const classes =
    custom ||
    confidenceStyles[tone as ConfidenceLevel] ||
    riskStyles[tone as RiskLevel] ||
    statusStyles[tone as PickStatus] ||
    'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-200'

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  )
}

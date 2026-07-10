import { CheckCircle2, Database, Plug, ShieldCheck } from 'lucide-react'
import { integrationRoadmap } from '../config/integrations'

const icons = [Plug, CheckCircle2, Database, ShieldCheck]

export function WorkspaceStatus() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
          Preparado para escalar
        </p>
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">Estado de integraciones</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {integrationRoadmap.map((item, index) => {
          const Icon = icons[index] ?? Plug
          return (
            <div key={item.label} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-950 dark:text-white">{item.label}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.current}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.readyFor}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

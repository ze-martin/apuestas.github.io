import { Upload, ClipboardPaste, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { ProtocolPrediction } from '../types'
import { parseProtocolText } from '../utils/parsers'

export function DataLoader({
  onLoad,
  onReset,
}: {
  onLoad: (items: ProtocolPrediction[], message: string) => void
  onReset: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  async function processText(raw: string, origin: 'manual' | 'imported') {
    try {
      const parsed = await parseProtocolText(raw, origin)
      if (!parsed.length) throw new Error('No se detectaron filas validas.')
      setError('')
      onLoad(parsed, `Se cargaron ${parsed.length} pronosticos.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return
    const raw = await file.text()
    await processText(raw, 'imported')
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-5 w-5 text-slate-500" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Carga de datos</h2>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">Subir JSON o CSV</span>
          <span>La app conserva campos adicionales en el registro original.</span>
          <input
            className="sr-only"
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Restaurar datos mock
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardPaste className="h-5 w-5 text-slate-500" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Pegar resultados del protocolo</h2>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='Pega JSON, CSV o un objeto con una propiedad "predictions", "picks", "results" o "data".'
          className="min-h-36 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void processText(text, 'manual')}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Cargar texto pegado
          </button>
          {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}
        </div>
      </div>
    </section>
  )
}

import { integrationConfig } from '../config/integrations'
import type { ProtocolPrediction } from '../types'
import { parseProtocolReportHtml, parseProtocolText } from '../utils/parsers'

export async function fetchProtocolPredictions(): Promise<ProtocolPrediction[]> {
  if (integrationConfig.dataSourceMode === 'api' && integrationConfig.protocolApiUrl) {
    const response = await fetch(integrationConfig.protocolApiUrl, {
      headers: {
        Accept: 'application/json, text/csv, text/html',
      },
    })

    if (!response.ok) {
      throw new Error(`No se pudo leer la API del protocolo: ${response.status}`)
    }

    return parseProtocolText(await response.text(), 'imported')
  }

  if (integrationConfig.dataSourceMode === 'github-pages') {
    return fetchLatestGithubPagesReport()
  }

  return []
}

async function fetchLatestGithubPagesReport(): Promise<ProtocolPrediction[]> {
  const indexResponse = await fetch(integrationConfig.protocolIndexUrl)
  if (!indexResponse.ok) {
    throw new Error(`No se pudo leer el indice de reportes: ${indexResponse.status}`)
  }

  const indexHtml = await indexResponse.text()
  const reportUrl = findLatestReportUrl(indexHtml, integrationConfig.protocolIndexUrl)
  if (!reportUrl) {
    throw new Error('No se encontro ningun enlace reports/*.html en el sitio del protocolo.')
  }

  const reportResponse = await fetch(reportUrl)
  if (!reportResponse.ok) {
    throw new Error(`No se pudo leer el reporte ${reportUrl}: ${reportResponse.status}`)
  }

  return parseProtocolReportHtml(await reportResponse.text(), reportUrl)
}

export function findLatestReportUrl(indexHtml: string, baseUrl: string) {
  const document = new DOMParser().parseFromString(indexHtml, 'text/html')
  const href = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .find((value) => value.includes('reports/') && value.endsWith('.html'))

  return href ? new URL(href, baseUrl).toString() : ''
}

export function getAuthReadinessNote() {
  if (integrationConfig.authProvider === 'none') {
    return 'Autenticacion pendiente. No se deben exponer secretos ni tokens privados en el frontend.'
  }

  return `Proveedor de autenticacion preparado: ${integrationConfig.authProvider}. Validar sesiones en backend antes de conectar datos privados.`
}

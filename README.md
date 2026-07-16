# Dashboard Protocolo Apuestas

Aplicacion React + Vite para convertir reportes HTML/CSV del protocolo en un panel procesado de decision para apuestas deportivas.

La app no promete rentabilidad. Siempre muestra la advertencia operativa: **Validar cuota en Betano antes de apostar**. Los reportes pueden traer cuotas paralelas de 10Bet/API y Betano; cuando existe cuota Betano, la app la usa como referencia principal para filtros, EV, edge, score y riesgo.

## Fuente de datos

La app permite:

- Cargar un CSV local.
- Cargar un HTML local del reporte.
- Cargar automaticamente todos los reportes enlazados desde la fuente configurada en `VITE_PROTOCOL_INDEX_URL`.

La interfaz publica no muestra ni permite editar la URL de origen. El boton `Cargar datos` usa la fuente configurada internamente y consolida las fechas disponibles en el filtro `Fecha`.

Importante: ocultar la URL en la interfaz mejora la experiencia y reduce exposicion visual, pero no es seguridad completa si el sitio sigue siendo estatico en GitHub Pages. Para proteger realmente datos, usuarios y suscripciones, la fuente debe pasar por un backend con autenticacion.

Columnas CSV soportadas:

```text
fecha, hora, partido, bookmaker, pick, market_original, probabilidad,
prob_num, cuota, ev, ev_num, estado, confianza, fuente, razon, riesgo
```

Tambien soporta el formato nuevo del dashboard publicado en GitHub Pages:

```text
Hora, Partido, Pick, Prob, Book 10Bet/API, Cuota 10Bet/API,
EV 10Bet/API, Book Betano, Cuota Betano, EV Betano,
Estado 10Bet/API, Estado Betano, Confianza, Fuente, Riesgo
```

Si un mercado trae cuota Betano y 10Bet/API, ambas se conservan en la tabla y exportacion. Betano queda como `bookmaker_preferido`; si Betano no tiene cuota valida, se usa 10Bet/API como respaldo. Si no existe ninguna cuota valida, el mercado queda como informativo.

Los mercados sin cuota no entran al panel principal. Se muestran como informativos en la pestaña `Probabilidades sin cuota`.

## Procesamiento implementado

Archivo principal:

```text
src/domain/pickProcessing.ts
```

Funciones separadas:

- `parseReportText`: detecta CSV o HTML.
- `processRawPick`: convierte una fila cruda en `ProcessedPick`.
- `normalizeMarket`: detecta tipo, lado, direccion, linea y grupo de correlacion.
- `classifyRisk`: clasifica riesgo segun probabilidad, EV y cuota.
- `filterPicks`: aplica filtros del dashboard.
- `createSuggestedParlay`: arma combinadas evitando redundancia/correlacion excesiva.

Campos derivados:

- `hasOdds = cuota valida`.
- `hasBetanoOdds = cuota Betano valida`.
- `hasApiOdds = cuota 10Bet/API valida`.
- `isPositiveEV = ev_num > 0`.
- `isPositiveBetanoEV = EV Betano > 0`.
- `isPositiveApiEV = EV 10Bet/API > 0`.
- `impliedProbability = 1 / cuota`.
- `edge = prob_num - impliedProbability`.
- `edgePct = edge * 100`.
- `pickScore = probability * 45 + max(edge, 0) * 35 + confidenceWeight * 20`.

Pesos de confianza:

```text
Alta  = 1
Media = 0.65
Baja  = 0.35
```

Clasificacion de riesgo:

- `Bajo`: `prob_num >= 0.80` y `ev_num > 0`.
- `Medio`: `prob_num >= 0.65`, `< 0.80` y `ev_num > 0`.
- `Alto`: `prob_num < 0.65` o `cuota >= 3.00`.

Normalizacion de mercado:

- `marketType`: `goals`, `first_half_goals`, `corners`, `cards`, `btts`, `winner`, `draw_no_bet`, `shots`, `other`.
- `side`: `home`, `away`, `total`, `none`.
- `direction`: `over`, `under`, `yes`, `no`, `home`, `away`, `none`.
- `line`: linea numerica detectada, por ejemplo `1.5`, `2.5`, `9.5`.

## Dashboard

KPIs superiores:

- Partidos.
- Con cuota 10Bet/API.
- Con cuota Betano.
- EV+ 10Bet/API.
- EV+ Betano.
- EV promedio positivo.
- Mejor edge.

Filtros:

- Fecha.
- Partido.
- Tipo de mercado.
- Riesgo.
- Solo EV+.
- Cuota minima/maxima.
- Probabilidad minima.
- Busqueda por partido/pick/mercado.

El filtro `Fecha` se llena con todas las fechas detectadas en los reportes cargados. Si un HTML antiguo no trae fecha en el titulo, la app la infiere desde el nombre del archivo, por ejemplo `protocolo_20260705_pc.html`.

Vistas:

- `Panel principal`: tabla ordenable con partido, hora, pick, probabilidad, bookmaker de referencia, cuota/EV de referencia, cuota/EV Betano, cuota/EV 10Bet/API, edge, score, riesgo y confianza.
- `Vista por partido`: tarjetas por partido con mejor pick seguro, mejor EV, mejor score, top 5 EV+ y combinada sugerida.
- `Mi seguimiento`: recuento editable por usuario de los picks incluidos en las combinadas sugeridas por partido.
- `Historial real`: rendimiento real de las recomendaciones de combinadas sugeridas, usando solo resultados cargados por CSV/HTML.
- `Probabilidades sin cuota`: mercados informativos sin cuota.

## Seguimiento e historial real

Las vistas `Mi seguimiento` e `Historial real` reconstruyen los picks sugeridos por partido usando la misma regla de `createSuggestedParlay`.

Incluye:

- Total de picks sugeridos.
- Picks liquidados.
- Aciertos.
- Fallos.
- Devueltos.
- Sin dato oficial.
- Pendientes.
- Tasa de acierto.
- P/L y ROI simulados con stake fijo de 1 unidad por pick.

`Mi seguimiento` sirve para que cada usuario marque manualmente su control propio como `Acertado`, `Fallado`, `Devuelto` o `Pendiente`. Esas marcas se guardan en `localStorage` del navegador.

`Historial real` no usa marcas manuales. Solo toma resultados reales cargados en el CSV/HTML del protocolo. Reconoce campos como `resultado_real`, `resultado_pick`, `resultado`, `result`, `outcome`, `settlement`, `status_resultado`, `estado_resultado`, `pick_result` o `resultado_final`, ademas de estados reconocibles como `Acertado`, `Fallado`, `Devuelto`, `Win`, `Loss`, `Void`, etc.

Si el reporte solo trae estados operativos como `EV positivo Betano`, el pick queda `Pendiente` hasta que se consulte la API o se cargue un resultado verificable. Si API-Football no encuentra el fixture o no devuelve estadisticas suficientes para una fecha ya pasada, el pick queda como `Sin dato oficial`. La app no inventa resultados.

### Liquidacion con API-Football

La app incluye un backend local para consultar API-Football sin exponer `FOOTBALL_API_KEY` en el navegador:

```bash
npm run settlement:api
```

En otra terminal:

```bash
npm run dev
```

El frontend llama a `/api/settlements` y Vite lo proxya a `http://127.0.0.1:8787`. La clave se lee solo en `server/settlementServer.mjs` desde `.env` o, en este equipo, como respaldo local desde `../APUESTAS/.env`.

El boton `Actualizar resultados reales` de la vista `Historial real` envia solo los picks sugeridos y recibe:

- resultado liquidado (`Acertado`, `Fallado`, `Devuelto`, `Pendiente`, `Sin dato oficial`);
- marcador si API-Football lo devuelve;
- razon de liquidacion;
- resumen de requests y cache.
- graficas de distribucion de resultados y resultados por fecha.

### Resultados reales en GitHub Pages

GitHub Pages no ejecuta backend ni scraping. Para no exponer claves en GitHub, el flujo recomendado es local:

1. Actualiza los HTML/CSV del protocolo.
2. Ejecuta localmente la liquidacion de resultados:

```bash
npm run settlement:snapshot
```

3. Revisa `public/settlements/latest.json`.
4. Sube el archivo actualizado:

```bash
git add public/settlements/latest.json
git commit -m "Actualizar resultados reales"
git push
```

El dashboard publicado en GitHub Pages solo lee `public/settlements/latest.json`. La API key vive en tu equipo local, por ejemplo en `.env` o en el proyecto privado `../APUESTAS/.env`, y no se publica.

El workflow `.github/workflows/refresh-settlements.yml` queda disponible solo como ejecucion manual opcional. No corre en horario automatico para evitar fallos por falta de secrets y para mantener la API key fuera de GitHub.

Variables utiles:

- `SETTLEMENT_TIMEZONE=America/Lima` define el corte de "hoy" para decidir si una fecha pasada sin datos oficiales debe dejar de mostrarse como pendiente.
- `SETTLEMENT_TODAY=YYYY-MM-DD` permite fijar manualmente la fecha de corte en pruebas o despliegues con reloj distinto.

Gasto adicional estimado:

- Resultado basico: 1 request por fecha para localizar/leer fixtures (`fixtures?date=YYYY-MM-DD`), amortizado entre todos los partidos de ese dia.
- Mercados avanzados como corners, tarjetas, tiros o tiros al arco: +1 request por partido para `fixtures/statistics`.
- Maximo recomendado operativo: hasta 2 requests por partido cuando se requiere estadistica avanzada.

El servidor optimiza por fecha/liga y cachea respuestas, por lo que el gasto real puede ser menor. La respuesta muestra `apiRequests`, `cacheHits` y `estimatedExtraRequestsPerMatch`.

## Combinadas sugeridas

Reglas:

- Prioriza riesgo `Bajo` y `Medio`.
- Evita mas de 2 picks del mismo `correlationGroup`.
- Evita combinar dos lineas redundantes del mismo mercado, por ejemplo `Goles +1.5` y `Goles +2.5`.
- Maximo 4 picks por partido.
- Si una combinada supera 10 selecciones, muestra advertencia.

## Estructura relevante

```text
src/
  App.tsx
  components/
    ProcessedBettingDashboard.tsx
  domain/
    pickProcessing.ts
```

Componentes antiguos del dashboard inicial permanecen en el repo, pero la pantalla activa usa `ProcessedBettingDashboard`.

## Publicacion en GitHub Pages

Este proyecto incluye el workflow `.github/workflows/deploy-github-pages.yml` para publicar automaticamente el dashboard estatico en GitHub Pages.

Para usar el repositorio que se ve en tu captura, `ze-martin/apuestas.github.io`:

1. Usa el repositorio `https://github.com/ze-martin/apuestas.github.io`.
2. Sube este proyecto a ese repositorio.
3. En GitHub, entra a `Settings > Pages` y selecciona `GitHub Actions` como fuente de publicacion.
4. En `Settings > Secrets and variables > Actions > Variables`, configura:

```text
VITE_BASE_PATH=/apuestas.github.io/
VITE_PROTOCOL_INDEX_URL=https://ze-martin.github.io/
```

Con esa configuracion, la URL publica esperada es:

```text
https://ze-martin.github.io/apuestas.github.io/
```

Si mas adelante quieres que el dashboard viva directamente en `https://ze-martin.github.io/`, el repositorio debe llamarse `ze-martin.github.io` y entonces `VITE_BASE_PATH=/`.

Si mas adelante tienes backend publico para liquidar resultados reales, agrega tambien:

```text
VITE_SETTLEMENT_API_URL=https://tu-backend-publico.com/api/settlements
```

GitHub Pages solo sirve archivos estaticos. No ejecuta `server/settlementServer.mjs`, por eso la API key de API-Football debe vivir en un backend externo como Render, Railway, Fly.io, VPS o funciones serverless. Sin ese backend publico, el dashboard, la carga de reportes, filtros, simulacion Betano y guia funcionan, pero `Actualizar resultados reales` mostrara un aviso indicando que falta configurar `VITE_SETTLEMENT_API_URL`.

## App instalable

El proyecto incluye configuracion PWA inicial:

- `public/manifest.webmanifest`
- `public/sw.js`
- registro del service worker en `src/main.tsx`

Con esto, en Android se puede instalar desde Chrome con `Agregar a pantalla principal`. En iPhone se instala desde Safari con `Compartir > Agregar a pantalla de inicio`.

Para publicar como app nativa en tiendas, la ruta recomendada es envolver este frontend con Capacitor:

1. Mantener React/Vite como base.
2. Agregar Capacitor para iOS y Android.
3. Compilar el dashboard.
4. Generar proyectos nativos.
5. Publicar en Google Play y App Store.

Para suscripciones reales, no usar GitHub Pages como unica capa. Se recomienda backend con autenticacion, planes, pagos y API protegida.

## Primera accion tecnica: datos protegidos

La app ya queda preparada para cambiar de fuente estatica a fuente protegida con Supabase:

- `src/components/AuthGate.tsx`: login con Supabase cuando `VITE_AUTH_PROVIDER=supabase`.
- `src/services/supabaseClient.ts`: cliente Supabase del frontend.
- `src/services/protectedProtocolRepository.ts`: lectura de picks desde tabla `picks`.
- `supabase/migrations/001_private_protocol_schema.sql`: tablas y politicas RLS.
- `server/importReportsToSupabase.mjs`: importador local de reportes HTML hacia Supabase.

Flujo recomendado:

1. Crear proyecto Supabase.
2. Ejecutar el SQL de `supabase/migrations/001_private_protocol_schema.sql`.
3. Crear usuarios en Supabase Auth.
4. Marcar tu usuario como admin en `profiles`.
5. Configurar `.env` local:

```text
VITE_DATA_SOURCE_MODE=supabase
VITE_AUTH_PROVIDER=supabase
VITE_DATABASE_PROVIDER=supabase
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
SUPABASE_REPORT_VISIBILITY=premium
```

6. Importar reportes desde tu equipo local:

```bash
npm run supabase:import
```

7. Importar resultados reales desde el snapshot local:

```bash
npm run supabase:import-settlements
```

8. Ejecutar y validar:

```bash
npm run dev
```

No subas `SUPABASE_SERVICE_ROLE_KEY` a GitHub. Esa clave solo debe vivir en `.env` local o en un backend privado.

### Plan de implementacion comercial

1. **Base protegida:** activar Supabase, RLS y carga de picks con `npm run supabase:import`.
2. **Login privado:** usar `VITE_AUTH_PROVIDER=supabase` y crear perfiles `free`, `premium`, `pro`.
3. **Panel admin:** agregar una vista interna para subir HTML/CSV y disparar importaciones.
4. **Suscripciones:** integrar Stripe o MercadoPago y actualizar `profiles.plan` y `profiles.subscription_status`.
5. **API privada:** mover liquidacion de resultados, scraping y claves deportivas a backend/edge functions.
6. **PWA comercial:** mantener instalacion desde navegador con login y planes.
7. **Apps nativas:** envolver con Capacitor para Android/iOS.
8. **Publicacion:** Google Play primero; App Store requiere Mac y cuenta Apple Developer.
9. **Operacion:** monitoreo de errores, auditoria de acceso, terminos de uso y juego responsable.

## Instalacion y ejecucion

```bash
npm install
npm run dev
npm run build
npm run preview
```

En este equipo se uso `pnpm` del runtime de Codex:

```powershell
$env:Path='C:\Users\USUARIO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\USUARIO\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:Path
pnpm install
pnpm run dev
pnpm run build
```

## Validacion

- `pnpm run build`: correcto.
- `pnpm run lint`: correcto.
- Prueba Playwright con CSV de control:
  - carga CSV local,
  - KPIs,
  - panel principal,
  - vista por partido,
  - combinada sugerida,
  - pestaña `Probabilidades sin cuota`.

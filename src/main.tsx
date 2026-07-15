import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    navigator.serviceWorker.register(`${baseUrl}sw.js`).catch(() => {
      // La app debe seguir funcionando aunque el navegador bloquee la instalacion PWA.
    })
  })
}

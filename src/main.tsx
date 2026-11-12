import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The installed app keeps working offline: register the service worker in
// production builds only, so dev reloads never serve a stale shell.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // No offline support (private mode, unsupported browser) — the scene
    // still works exactly as before.
  })
}

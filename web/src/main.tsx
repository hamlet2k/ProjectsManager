import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { purgeStaleServiceWorkers } from './features/assistant/speech'
import './styles/index.css'

// Drop leftover PWA service workers from earlier deploys (cached Whisper UI on iPad).
void purgeStaleServiceWorkers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

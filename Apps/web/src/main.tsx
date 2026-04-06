import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './styles/globals.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { AccessibilityProvider } from './stores/AccessibilityContext'
import { initializeReducedMotionPreferenceSync } from './utils/motionPreferences'

initializeReducedMotionPreferenceSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AccessibilityProvider>
        <App />
      </AccessibilityProvider>
    </QueryClientProvider>
  </StrictMode>,
)

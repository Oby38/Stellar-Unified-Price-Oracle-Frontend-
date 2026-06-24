import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Dashboard } from './pages/Dashboard'
import { NotFound } from './pages/NotFound'
import { useWebVitals } from './hooks/useWebVitals'
import { useAccessibility } from './hooks/useAccessibility'
import { PreferencesProvider } from './preferences/PreferencesContext'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/ToastContainer'
import { usePriceContext } from './context/PriceContext'
import { useObservability } from './observability/hooks/useObservability'
import { ObservabilityDashboard } from './observability/ui/ObservabilityDashboard'

const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

function AppContent() {
  const location = useLocation()
  useAccessibility()
  return (
    <ErrorBoundary key={location.key}>
      <PreferencesProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </PreferencesProvider>
    </ErrorBoundary>
  )
}

// Observability overlay lives inside PriceProvider so it can access wsStatus
function ObservabilityOverlay() {
  const [visible, setVisible] = useState(false)
  const { wsStatus, refetchPrices, pricesError } = usePriceContext()
  const isApiReachable = !pricesError

  const { probes, overallHealth, healingHistory, forceHeal } = useObservability({
    wsStatus,
    isApiReachable,
    reconnectWs: refetchPrices,
    refetchState: refetchPrices,
  })

  // Ctrl+Shift+O toggles the observability panel (#117 requirement)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        setVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!visible) return null

  return (
    <ObservabilityDashboard
      probes={probes}
      overallHealth={overallHealth}
      healingHistory={healingHistory}
      onForceHeal={forceHeal}
    />
  )
}

export default function App() {
  useWebVitals()

  return (
    <BrowserRouter basename={BASENAME}>
      <ToastProvider>
        <AppContent />
        <ToastContainer />
        <ObservabilityOverlay />
      </ToastProvider>
    </BrowserRouter>
  )
}

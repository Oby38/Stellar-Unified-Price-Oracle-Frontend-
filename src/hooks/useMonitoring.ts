import { useEffect, useMemo, useState } from 'react'
import {
  getConsoleWarnings,
  getLatencyHistory,
  getWebSocketAnalytics,
  installConsoleMonitoring,
  recordApiLatency,
  recordWebSocketEvent,
  setLatencyThreshold,
} from '../utils/monitoring'

interface ErrorSample {
  timestamp: number
  count: number
}

export function useMonitoring() {
  const [consoleWarnings, setConsoleWarnings] = useState(getConsoleWarnings())
  const [latencyHistory, setLatencyHistory] = useState(getLatencyHistory())
  const [websocketAnalytics, setWebsocketAnalytics] = useState(getWebSocketAnalytics())
  const [errorHistory, setErrorHistory] = useState<ErrorSample[]>([])
  const [latestLatencyMs, setLatestLatencyMs] = useState(0)
  const [threshold, setThreshold] = useState(250)

  useEffect(() => {
    const restore = installConsoleMonitoring({ suppressPatterns: [] })
    const interval = window.setInterval(() => {
      setConsoleWarnings(getConsoleWarnings())
      setLatencyHistory(getLatencyHistory())
      setWebsocketAnalytics(getWebSocketAnalytics())
    }, 1000)

    return () => {
      clearInterval(interval)
      restore()
    }
  }, [])

  useEffect(() => {
    const now = Date.now()
    recordApiLatency(150)
    setLatestLatencyMs(150)
    setLatencyHistory(getLatencyHistory())
    setThreshold(250)
    setLatencyThreshold(250)
    recordWebSocketEvent({ type: 'connect', timestamp: now })
  }, [])

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const start = performance.now()
      try {
        const response = await originalFetch(input, init)
        const duration = performance.now() - start
        recordApiLatency(duration)
        setLatestLatencyMs(duration)
        setLatencyHistory(getLatencyHistory())
        if (!response.ok) {
          setErrorHistory((prev) => [...prev.slice(-11), { timestamp: Date.now(), count: 1 }])
        }
        return response
      } catch (error) {
        const duration = performance.now() - start
        recordApiLatency(duration)
        setLatestLatencyMs(duration)
        setLatencyHistory(getLatencyHistory())
        setErrorHistory((prev) => [...prev.slice(-11), { timestamp: Date.now(), count: 1 }])
        throw error
      }
    }

    window.fetch = wrappedFetch as typeof window.fetch
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  const value = useMemo(() => ({
    consoleWarnings,
    latencyHistory,
    websocketAnalytics,
    errorHistory,
    latestLatencyMs,
    threshold,
  }), [consoleWarnings, latencyHistory, websocketAnalytics, errorHistory, latestLatencyMs, threshold])

  return value
}


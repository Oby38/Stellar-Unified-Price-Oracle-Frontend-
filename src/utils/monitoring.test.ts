import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearMonitoringState,
  exportDiagnosticsBundle,
  getConsoleWarnings,
  getLatencyHistory,
  getWebSocketAnalytics,
  installConsoleMonitoring,
  recordApiLatency,
  recordWebSocketEvent,
  setLatencyThreshold,
} from './monitoring'

describe('monitoring utilities', () => {
  beforeEach(() => {
    clearMonitoringState()
    vi.restoreAllMocks()
  })

  it('aggregates console warnings and suppresses known benign messages', () => {
    const restore = installConsoleMonitoring({ suppressPatterns: ['ResizeObserver loop limit exceeded'] })

    console.warn('Network error: failed to fetch')
    console.warn('Network error: failed to fetch')
    console.error('Network error: failed to fetch')
    console.warn('ResizeObserver loop limit exceeded')

    const warnings = getConsoleWarnings()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ count: 3, level: 'error' })

    restore()
  })

  it('records api latency history and exposes threshold-based alerts', () => {
    setLatencyThreshold(200)
    recordApiLatency(150)
    recordApiLatency(350)

    const history = getLatencyHistory()
    expect(history).toHaveLength(2)
    expect(history[1].exceededThreshold).toBe(true)
  })

  it('tracks websocket events and exports diagnostics bundle', () => {
    recordWebSocketEvent({ type: 'connect', timestamp: 1000 })
    recordWebSocketEvent({ type: 'disconnect', timestamp: 2000, durationMs: 1000 })
    recordWebSocketEvent({ type: 'reconnect', timestamp: 3000 })
    recordWebSocketEvent({ type: 'error', timestamp: 4000, details: 'boom' })

    const analytics = getWebSocketAnalytics()
    expect(analytics.disconnectCount).toBe(1)
    expect(analytics.reconnectCount).toBe(1)
    expect(analytics.events).toHaveLength(4)

    const bundle = exportDiagnosticsBundle()
    expect(bundle.webSocket.analytics.disconnectCount).toBe(1)
    expect(bundle.consoleWarnings).toHaveLength(0)
  })
})

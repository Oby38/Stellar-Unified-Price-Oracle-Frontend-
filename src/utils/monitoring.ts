export interface ConsoleWarningEntry {
  id: string
  level: 'warn' | 'error'
  message: string
  count: number
  firstSeen: number
  lastSeen: number
}

export interface LatencySample {
  id: string
  timestamp: number
  latencyMs: number
  exceededThreshold: boolean
}

export interface WebSocketEvent {
  id: string
  type: 'connect' | 'disconnect' | 'reconnect' | 'error' | 'latency'
  timestamp: number
  durationMs?: number
  details?: string
  latencyMs?: number
}

export interface WebSocketAnalytics {
  events: WebSocketEvent[]
  disconnectCount: number
  reconnectCount: number
  lastError?: string
  averageLatencyMs: number
}

export interface DiagnosticsBundle {
  consoleWarnings: ConsoleWarningEntry[]
  latency: LatencySample[]
  webSocket: {
    analytics: WebSocketAnalytics
  }
}

interface MonitoringState {
  consoleWarnings: ConsoleWarningEntry[]
  latencyHistory: LatencySample[]
  websocketEvents: WebSocketEvent[]
  latencyThreshold: number
  suppressPatterns: string[]
}

const state: MonitoringState = {
  consoleWarnings: [],
  latencyHistory: [],
  websocketEvents: [],
  latencyThreshold: 250,
  suppressPatterns: [],
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeMessage(message: unknown): string {
  if (typeof message === 'string') return message
  if (message instanceof Error) return message.message
  try {
    return JSON.stringify(message)
  } catch {
    return String(message)
  }
}

export function installConsoleMonitoring(options?: { suppressPatterns?: string[] }) {
  state.suppressPatterns = options?.suppressPatterns ?? state.suppressPatterns

  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)

  const capture = (level: 'warn' | 'error', args: unknown[]) => {
    const message = normalizeMessage(args[0])
    if (state.suppressPatterns.some((pattern) => message.includes(pattern))) {
      return
    }

    const existing = state.consoleWarnings.find((entry) => entry.message === message)
    if (existing) {
      existing.count += 1
      existing.lastSeen = Date.now()
      if (level === 'error' && existing.level === 'warn') {
        existing.level = 'error'
      }
      return
    }

    state.consoleWarnings.push({
      id: createId(level),
      level,
      message,
      count: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    })
  }

  console.warn = (...args: unknown[]) => {
    capture('warn', args)
    originalWarn(...args)
  }

  console.error = (...args: unknown[]) => {
    capture('error', args)
    originalError(...args)
  }

  return () => {
    console.warn = originalWarn
    console.error = originalError
  }
}

export function getConsoleWarnings(): ConsoleWarningEntry[] {
  return state.consoleWarnings.slice().sort((a, b) => b.count - a.count)
}

export function recordApiLatency(latencyMs: number) {
  const exceededThreshold = latencyMs >= state.latencyThreshold
  const sample: LatencySample = {
    id: createId('latency'),
    timestamp: Date.now(),
    latencyMs,
    exceededThreshold,
  }

  state.latencyHistory.push(sample)
  if (state.latencyHistory.length > 120) {
    state.latencyHistory.shift()
  }
  return sample
}

export function getLatencyHistory(): LatencySample[] {
  return state.latencyHistory.slice()
}

export function setLatencyThreshold(threshold: number) {
  state.latencyThreshold = threshold
}

export function setConsoleSuppressionPatterns(patterns: string[]) {
  state.suppressPatterns = patterns
}

export function recordWebSocketEvent(event: Omit<WebSocketEvent, 'id'>) {
  const entry: WebSocketEvent = {
    id: createId('ws-event'),
    ...event,
  }
  state.websocketEvents.push(entry)
  if (state.websocketEvents.length > 200) {
    state.websocketEvents.shift()
  }
  return entry
}

export function getWebSocketAnalytics(): WebSocketAnalytics {
  const disconnectCount = state.websocketEvents.filter((event) => event.type === 'disconnect').length
  const reconnectCount = state.websocketEvents.filter((event) => event.type === 'reconnect').length
  const lastError = [...state.websocketEvents].reverse().find((event) => event.type === 'error')?.details
  const latencies = state.websocketEvents.filter((event) => event.type === 'latency' && typeof event.latencyMs === 'number')
  const averageLatencyMs = latencies.length > 0
    ? latencies.reduce((total, event) => total + (event.latencyMs ?? 0), 0) / latencies.length
    : 0

  return {
    events: state.websocketEvents.slice(),
    disconnectCount,
    reconnectCount,
    lastError,
    averageLatencyMs,
  }
}

export function exportDiagnosticsBundle(): DiagnosticsBundle {
  return {
    consoleWarnings: getConsoleWarnings(),
    latency: getLatencyHistory(),
    webSocket: {
      analytics: getWebSocketAnalytics(),
    },
  }
}

export function clearMonitoringState() {
  state.consoleWarnings = []
  state.latencyHistory = []
  state.websocketEvents = []
  state.latencyThreshold = 250
  state.suppressPatterns = []
}

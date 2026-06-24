// #117 — Health probe system

export type ProbeStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface ProbeResult {
  name: string
  status: ProbeStatus
  message: string
  timestamp: number
  latencyMs?: number
}

type ProbeChecker = () => ProbeResult | Promise<ProbeResult>

const probes = new Map<string, ProbeChecker>()
const results = new Map<string, ProbeResult>()
const intervals = new Map<string, ReturnType<typeof setInterval>>()

export function registerProbe(name: string, checker: ProbeChecker, intervalMs = 10_000) {
  probes.set(name, checker)

  const run = async () => {
    const t0 = performance.now()
    try {
      const result = await checker()
      result.latencyMs = performance.now() - t0
      results.set(name, result)
    } catch (err) {
      results.set(name, {
        name,
        status: 'unhealthy',
        message: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
        latencyMs: performance.now() - t0,
      })
    }
  }

  void run()
  intervals.set(name, setInterval(() => void run(), intervalMs))
}

export function unregisterProbe(name: string) {
  probes.delete(name)
  results.delete(name)
  const id = intervals.get(name)
  if (id !== undefined) {
    clearInterval(id)
    intervals.delete(name)
  }
}

export function getProbeResults(): ProbeResult[] {
  return Array.from(results.values())
}

export function getOverallHealth(): ProbeStatus {
  const all = getProbeResults()
  if (all.some((r) => r.status === 'unhealthy')) return 'unhealthy'
  if (all.some((r) => r.status === 'degraded')) return 'degraded'
  return 'healthy'
}

// Built-in probes
export function registerBuiltinProbes(getWsStatus: () => string, getApiReachable: () => boolean) {
  // Liveness: is main thread responsive? (simply records the probe ran)
  registerProbe(
    'liveness',
    () => ({
      name: 'liveness',
      status: 'healthy' as ProbeStatus,
      message: 'Main thread is responsive',
      timestamp: Date.now(),
    }),
    5_000,
  )

  // Readiness: WebSocket + API connectivity
  registerProbe(
    'readiness',
    () => {
      const wsOk = getWsStatus() === 'connected'
      const apiOk = getApiReachable()
      const status: ProbeStatus = wsOk && apiOk ? 'healthy' : !wsOk && !apiOk ? 'unhealthy' : 'degraded'
      return {
        name: 'readiness',
        status,
        message: `WS: ${getWsStatus()}, API: ${apiOk ? 'ok' : 'unreachable'}`,
        timestamp: Date.now(),
      }
    },
    10_000,
  )

  // Memory probe
  registerProbe(
    'memory',
    () => {
      const nav = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
      if (!nav.memory) {
        return { name: 'memory', status: 'healthy' as ProbeStatus, message: 'Memory API unavailable', timestamp: Date.now() }
      }
      const ratio = nav.memory.usedJSHeapSize / nav.memory.jsHeapSizeLimit
      const status: ProbeStatus = ratio > 0.9 ? 'unhealthy' : ratio > 0.7 ? 'degraded' : 'healthy'
      return {
        name: 'memory',
        status,
        message: `Heap: ${(ratio * 100).toFixed(1)}% used`,
        timestamp: Date.now(),
      }
    },
    15_000,
  )
}

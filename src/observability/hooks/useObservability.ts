import { useCallback, useEffect, useRef, useState } from 'react'
import { registerBuiltinProbes, getProbeResults, getOverallHealth, unregisterProbe } from '../probes/healthProbes'
import { attemptHealing, getHealingHistory } from '../healing/selfHealing'
import { tracer, metrics } from '../instrumentation/tracer'
import type { ProbeResult } from '../probes/healthProbes'
import type { HealingRecord } from '../healing/selfHealing'

interface UseObservabilityOptions {
  wsStatus: string
  isApiReachable: boolean
  reconnectWs?: () => void
  refetchState?: () => void
}

export function useObservability({ wsStatus, isApiReachable, reconnectWs, refetchState }: UseObservabilityOptions) {
  const [probes, setProbes] = useState<ProbeResult[]>([])
  const [healingHistory, setHealingHistory] = useState<HealingRecord[]>([])
  const wsStatusRef = useRef(wsStatus)
  const isApiReachableRef = useRef(isApiReachable)

  wsStatusRef.current = wsStatus
  isApiReachableRef.current = isApiReachable

  // Register built-in probes once
  useEffect(() => {
    registerBuiltinProbes(
      () => wsStatusRef.current,
      () => isApiReachableRef.current,
    )

    const interval = setInterval(() => {
      setProbes(getProbeResults())
    }, 2_000)

    return () => {
      clearInterval(interval)
      unregisterProbe('liveness')
      unregisterProbe('readiness')
      unregisterProbe('memory')
    }
  }, [])

  // Auto-heal disconnected WebSocket
  useEffect(() => {
    if (wsStatus === 'disconnected') {
      const healed = attemptHealing('reconnect-ws', 'WS disconnected', { reconnectWs })
      if (healed) setHealingHistory(getHealingHistory())
    }
  }, [wsStatus, reconnectWs])

  const recordApiCall = useCallback((name: string, durationMs: number, ok: boolean) => {
    metrics.record('api.latency', durationMs, { endpoint: name })
    metrics.record('api.error', ok ? 0 : 1, { endpoint: name })
  }, [])

  const forceHeal = useCallback(
    (reason: string) => {
      attemptHealing('refetch-state', reason, { refetchState })
      setHealingHistory(getHealingHistory())
    },
    [refetchState],
  )

  return {
    probes,
    overallHealth: getOverallHealth(),
    healingHistory,
    recordApiCall,
    forceHeal,
    tracer,
    metrics,
  }
}
